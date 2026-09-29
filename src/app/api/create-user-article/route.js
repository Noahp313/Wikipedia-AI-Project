import { getCachedArticle, setCachedUserArticle } from "../../../lib/cache";
import { callGemini } from "../../../lib/geminiClient";

const GEMINI_MODEL = "gemini-3.5-flash";

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

function buildGroundedPrompt(query, sourceText) {
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
  `;
}

function buildUngroundedPrompt(query) {
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
  `;
}

async function createUserArticle(query, sourceText, devStatus) {
  const isGrounded = devStatus === "grounded";
  const prompt = isGrounded
    ? buildGroundedPrompt(query, sourceText)
    : buildUngroundedPrompt(query);

  const data = await callGemini({ source: "create-user-article", prompt, model: GEMINI_MODEL });
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error("No text returned from Gemini API");
  }

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
    parsed = JSON.parse(jsonString);
  } catch {
    try {
      parsed = JSON.parse(cleaned);
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

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { query, topics, userId, devStatus } = body;

  if (!userId || typeof userId !== "string") {
    return Response.json({ error: "Missing userId" }, { status: 400 });
  }

  if (!query || typeof query !== "string" || !query.trim()) {
    return Response.json({ error: "Missing query" }, { status: 400 });
  }

  const cleanedQuery = query.trim();
  const isGrounded = devStatus === "grounded";

  let sourceText = "";
  let uniqueTopicNames = [];

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

    if (!sourceText) {
      return Response.json({ error: "No matching cached sections found" }, { status: 404 });
    }
  }

  try {
    const article = await createUserArticle(cleanedQuery, sourceText, devStatus);

    article.sourceTopics = uniqueTopicNames;

    const articleId = await setCachedUserArticle(userId, cleanedQuery, article);

    return Response.json({ article, articleId, status: "generated", devStatus });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}