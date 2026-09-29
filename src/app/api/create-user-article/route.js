import { getCachedArticle, recordArticleOpen, setCachedUserArticle } from "../../../lib/cache";
import { streamGemini } from "../../../lib/geminiClient";
import { fixJsonEscapes, parsePartialJson } from "../../../lib/partialJson";
import {
  enforceMediaLimits,
  imageMenuPrompt,
  markdownGuidelines,
  mediaPolicy,
  repairLatexEscapes,
  unmetRequestNote,
} from "../../../lib/markdown";
import { normalizeFeatures, requestedFeatures } from "../../../lib/features";
import { fetchArticleImages, withCommonsImages } from "../../../lib/wikiImages";
import { ndjsonResponse } from "../../../lib/ndjsonResponse";
import { getSessionUser } from "../../../lib/session";
import { userArticleRateLimit } from "../../../lib/rateLimit";
import { levelInstructions, normalizeLevel } from "../../../lib/explanationLevels";
import {
  examplesNeedChecking,
  examplesPrompt,
  generateVerifiedExamples,
  insertExamples,
  requestsExamples,
  withExampleProvenance,
} from "../../../lib/verifiedExamples";

const GEMINI_MODEL = "gemini-3.5-flash";
const MAX_IMAGE_MENU = 12;

// The source topics' Wikipedia images, as one numbered menu for the writer.
// Topics cached before images were collected get them fetched now.
async function collectImages(topicNames, cachedArticles) {
  const lists = await Promise.all(
    topicNames.map((name) => {
      const cached = cachedArticles[name];
      if (!cached) return [];
      if (Array.isArray(cached.images)) return cached.images;
      const title = cached.sourceUrl ? decodeURIComponent(cached.sourceUrl.split("/wiki/")[1] ?? "").replace(/_/g, " ") : "";
      return title ? fetchArticleImages(title) : [];
    })
  );
  const seen = new Set();
  return lists
    .flat()
    .filter((img) => !seen.has(img.file) && seen.add(img.file))
    .slice(0, MAX_IMAGE_MENU);
}

function buildSourceText(relevantTopics, cachedArticles) {
  return relevantTopics
    .map(({ topic, heading }) => {
      const article = cachedArticles[topic];
      if (!article) return null;

      const section = article.sections.find((s) => s.heading === heading);
      if (!section) return null;

      return `Topic: ${topic}\nSection: ${heading}\nContent: ${section.content}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

function buildGroundedPrompt(query, sourceText, level, images, policy, examples) {
  return `
  You are a Wikipedia-style expert writer synthesizing a focused answer to a user's query, using only the source material below.

  Query: "${query}"

  SOURCE MATERIAL:
  """
  ${sourceText}
  """

  Return ONLY valid JSON (no markdown, no explanation):
  {
    "title": string,
    "sections": [
      { "heading": string, "content": string, "sourceStatus": "source" | "generated" | "hybrid" }
    ]
  }

  Guidelines:
  - Synthesize a single coherent article that directly answers the query, drawing primarily on the source material provided.
  - If the source material is incomplete or missing something the query needs (background, context, a connecting explanation), you may fill the gap using your own general knowledge — but never contradict the source material where it does speak to a topic.
  - Organize into natural sections (do NOT reuse the source headings verbatim unless they fit).
  - Mark each section's "sourceStatus": "source" if drawn entirely from the source material, "generated" if it had no coverage in the source and you wrote it from general knowledge, "hybrid" if it mixes both.
  - Write concise but informative paragraphs.

  ${levelInstructions(level)}

  ${markdownGuidelines(policy)}

  ${imageMenuPrompt(images, 0, policy)}

  ${examplesPrompt(examples)}
  `;
}

function buildUngroundedPrompt(query, level, images, policy, examples) {
  return `
  You are a Wikipedia-style expert writer answering a user's query from your own general knowledge. No source material was available for this query.

  Query: "${query}"

  Return ONLY valid JSON (no markdown, no explanation):
  {
    "title": string,
    "sections": [
      { "heading": string, "content": string, "sourceStatus": "generated" }
    ]
  }

  Guidelines:
  - Write a single coherent, accurate article that directly answers the query.
  - Every section is written from general knowledge, so every "sourceStatus" must be "generated" — do not use "source" or "hybrid".
  - Be upfront in tone and content that this reflects general knowledge rather than a specific cited source; do not fabricate specifics (dates, figures, quotes) you're not confident in.
  - Organize into natural sections. Write concise but informative paragraphs.

  ${levelInstructions(level)}

  ${markdownGuidelines(policy)}

  ${imageMenuPrompt(images, 0, policy)}

  ${examplesPrompt(examples)}
  `;
}

function parseArticleJson(text) {
  let cleaned = text.trim().replace(/```json/g, "").replace(/```/g, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start === -1 || end === -1) {
    console.error("No JSON found in Gemini response:", cleaned);
    throw new Error("Invalid AI response format");
  }

  const jsonString = cleaned.slice(start, end + 1);

  let parsed;
  try {
    parsed = JSON.parse(fixJsonEscapes(jsonString));
  } catch {
    try {
      parsed = JSON.parse(fixJsonEscapes(cleaned));
    } catch {
      console.error("Unable to parse Gemini JSON response:", cleaned);
      throw new Error("Invalid JSON returned from Gemini API");
    }
  }

  if (!parsed || !Array.isArray(parsed.sections)) {
    console.error("Gemini response missing sections array:", parsed);
    throw new Error("AI response is missing a sections array");
  }

  return parsed;
}

// Streams the article as it's written: { t: "title" } and { t: "section", i }
// events carry only what changed since the last event, then { t: "done" } once
// it's parsed, validated and saved. Nothing is saved from a partial response.
async function streamUserArticle({ send, user, query, sourceText, devStatus, level, sourceTopics, images, features }) {
  // The reader's selection, plus anything the query directly asks for ("with a table")
  const policy = mediaPolicy(features, requestedFeatures(query));

  // The image menu goes to the client up front so images show while streaming
  send({ t: "start", sourceTopics, level, images });

  // Asked for examples with something to compute: write and code-check them
  // first, so the writer only places them. Otherwise the writer handles them.
  let examples = [];
  if (requestsExamples(query) && (await examplesNeedChecking({ request: query, context: sourceText, source: "examples-gate" }))) {
    send({ t: "stage", stage: "examples" });
    examples = await generateVerifiedExamples({ request: query, context: sourceText, level, source: "verify-examples" });
    send({ t: "stage", stage: "writing" });
  }

  const prompt =
    devStatus === "grounded"
      ? buildGroundedPrompt(query, sourceText, level, images, policy, examples)
      : buildUngroundedPrompt(query, level, images, policy, examples);

  let text = "";
  let sentTitle;
  const sentSections = [];

  for await (const chunk of streamGemini({ source: "create-user-article", prompt, model: GEMINI_MODEL, json: true })) {
    text += chunk;
    const partial = parsePartialJson(text);
    if (!partial) continue;

    if (typeof partial.title === "string" && partial.title !== sentTitle) {
      sentTitle = partial.title;
      send({ t: "title", title: sentTitle });
    }

    (Array.isArray(partial.sections) ? partial.sections : []).forEach((s, i) => {
      if (!s || typeof s !== "object") return;
      const section = {
        heading: typeof s.heading === "string" ? s.heading : "",
        content:
          typeof s.content === "string"
            ? insertExamples(repairLatexEscapes(s.content), examples, new Set(), { partial: true }).content
            : "",
        ...(typeof s.sourceStatus === "string" && { sourceStatus: s.sourceStatus }),
      };
      const prev = sentSections[i];
      if (prev && prev.heading === section.heading && prev.content === section.content && prev.sourceStatus === section.sourceStatus) {
        return;
      }
      sentSections[i] = section;
      send({ t: "section", i, section });
    });
  }

  const article = parseArticleJson(text);
  const usedExamples = new Set();
  article.sections = enforceMediaLimits(
    article.sections.map((s) => {
      const { content, inserted, verified } = insertExamples(repairLatexEscapes(s.content), examples, usedExamples);
      return withExampleProvenance({ ...s, content }, inserted, verified);
    }),
    images,
    policy
  );
  article.sourceTopics = sourceTopics;
  article.level = level;
  // The selection only (not one-off requests), so chat edits keep following it
  article.features = features;
  // The whole menu is kept (not just what's used) so chat edits can add from it later
  article.images = images;

  const articleId = await setCachedUserArticle(user.id, query, article);
  if (!articleId) throw new Error("Couldn't save the article");
  // Counts as opened: the reader watched it being written
  await recordArticleOpen(user, articleId);

  // Told once, right after writing (not saved): a directly requested table, image or chart that couldn't be made
  send({ t: "done", articleId, article, notice: unmetRequestNote(policy.requested, article.sections) });
}

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { query, topics, devStatus } = body;
  const level = normalizeLevel(body.level);
  const features = normalizeFeatures(body.features);

  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "No session" }, { status: 401 });
  }

  const { success: withinLimit } = await userArticleRateLimit.limit(user.id);
  if (!withinLimit) {
    return Response.json({ error: "You've generated a lot of articles recently. Try again in a bit." }, { status: 429 });
  }

  if (!query || typeof query !== "string" || !query.trim()) {
    return Response.json({ error: "Missing query" }, { status: 400 });
  }

  const cleanedQuery = query.trim();
  const isGrounded = devStatus === "grounded";

  let sourceText = "";
  let uniqueTopicNames = [];
  let images = [];

  if (isGrounded) {
    if (!Array.isArray(topics)) {
      return Response.json({ error: "topics must be an array" }, { status: 400 });
    }

    uniqueTopicNames = [...new Set(topics.map((t) => t.topic))];

    const cachedArticles = {};
    await Promise.all(
      uniqueTopicNames.map(async (name) => {
        const cached = await getCachedArticle(name);
        if (cached) cachedArticles[name] = cached;
      })
    );

    sourceText = buildSourceText(topics, cachedArticles);
    // Skip the lookup when images are off and the query doesn't ask for any
    if (mediaPolicy(features, requestedFeatures(cleanedQuery)).maxImages > 0) {
      images = await collectImages(uniqueTopicNames, cachedArticles);
    }

    if (!sourceText) {
      return Response.json({ error: "No matching cached sections found" }, { status: 404 });
    }
  }

  // Directly asked for an image: the source articles often don't have a fitting
  // one, so Wikimedia Commons results are added to the menu
  if (requestedFeatures(cleanedQuery).includes("images")) {
    images = await withCommonsImages(images, cleanedQuery, uniqueTopicNames[0] ?? cleanedQuery);
  }

  return ndjsonResponse((send) =>
    streamUserArticle({
      send,
      user,
      query: cleanedQuery,
      sourceText,
      devStatus,
      level,
      sourceTopics: uniqueTopicNames,
      images,
      features,
    })
  );
}