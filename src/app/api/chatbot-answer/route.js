import { getCachedArticle } from "../../../lib/cache";
import { streamGemini } from "../../../lib/geminiClient";
import { fixJsonEscapes, parsePartialJson } from "../../../lib/partialJson";
import {
  countDiagrams,
  countImageRefs,
  enforceMediaLimits,
  imageMenuPrompt,
  isWikimediaUrl,
  markdownGuidelines,
  mediaPolicy,
  repairLatexEscapes,
  unmetRequestNote,
} from "../../../lib/markdown";
import { withCommonsImages } from "../../../lib/wikiImages";
import { normalizeFeatures, requestedFeatures } from "../../../lib/features";
import { ndjsonResponse } from "../../../lib/ndjsonResponse";
import { getSessionUser } from "../../../lib/session";
import { userChatRateLimit } from "../../../lib/rateLimit";
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
const VALID_SOURCE_STATUSES = ["source", "hybrid", "generated"];

function buildSourceText(relevantSections, cachedArticles) {
  return relevantSections
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

function historyBlock(history) {
  return (history || [])
    .map((t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.content}`)
    .join("\n");
}

// Parts of the article the reader attached to this message (highlighted text
// or whole sections). Mirrors the client's MAX_CONTEXTS / MAX_EXCERPT_CHARS.
const MAX_CONTEXTS = 5;
const MAX_EXCERPT_CHARS = 1000;

function parseContexts(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (c) => c && typeof c.heading === "string" && c.heading.trim() && (c.text === null || typeof c.text === "string")
    )
    .slice(0, MAX_CONTEXTS)
    .map((c) => ({ heading: c.heading.slice(0, 200), text: c.text ? c.text.slice(0, MAX_EXCERPT_CHARS + 1) : null }));
}

function contextBlock(contexts) {
  if (contexts.length === 0) return "";
  const lines = contexts.map((c, i) =>
    c.text ? `${i + 1}. Excerpt from the "${c.heading}" section: "${c.text}"` : `${i + 1}. The entire "${c.heading}" section`
  );
  return `
THE READER SELECTED THESE PARTS OF THE ARTICLE — their message is about them:
${lines.join(`\n`)}
- Read "this", "these", "it", "them", "here" as referring to the selected parts.
- If several are selected and the reader asks to compare them (or how they relate or differ), compare
  them directly: name the concrete similarities and differences rather than summarizing each one.
- For questions about the selected parts, "answer" may be up to 3 short sentences (under 70 words) —
  this overrides the one-sentence limit below.
- If the reader asks for a change to the selection (e.g. "rewrite this more simply"), only amend the
  section(s) the selection comes from.
`;
}

// The article's image menu as sent by the client — only well-formed Wikimedia
// entries are trusted (the renderer applies the same host check). Invalid
// entries become null rather than being removed, so image numbers don't shift.
// Up to 12 from the source articles plus Commons results from direct requests.
const MAX_IMAGE_MENU = 20;
function articleImages(article) {
  if (!Array.isArray(article.images)) return [];
  return article.images
    .slice(0, MAX_IMAGE_MENU)
    .map((img) =>
      img && typeof img.caption === "string" && isWikimediaUrl(img.url)
        ? img
        : null
    );
}

// What the examples pre-pass needs to know about the article: the parts the
// reader selected, else the whole article (capped), plus any source material.
const MAX_EXAMPLE_CONTEXT_CHARS = 12_000;
function exampleContext(currentArticle, contexts, sourceText) {
  const sectionText = (heading) =>
    `${heading}\n${currentArticle.sections.find((s) => s.heading === heading)?.content ?? ""}`;
  const selected = contexts.map((c) => (c.text ? `From "${c.heading}": ${c.text}` : sectionText(c.heading)));
  const body =
    selected.length > 0
      ? `The reader selected:\n${selected.join(`\n\n`)}`
      : currentArticle.sections.map((s) => sectionText(s.heading)).join(`\n\n`);
  const article = `Article: ${currentArticle.title}\n\n${body}`.slice(0, MAX_EXAMPLE_CONTEXT_CHARS);
  return sourceText
    ? `${article}\n\nSource material:\n${sourceText.slice(0, MAX_EXAMPLE_CONTEXT_CHARS)}`
    : article;
}

function buildAnswerPrompt({ query, history, currentArticle, sourceText, contexts = [], level, policy, images, examples = [] }) {
  return `
You are updating a Wikipedia-style article in response to a reader's follow-up question.
You are given the CURRENT ARTICLE for context. Return a direct answer plus a list of EDITS —
usually none. Most questions should be answered WITHOUT changing the article.

${historyBlock(history) ? `CONVERSATION SO FAR:\n${historyBlock(history)}\n` : ""}
Reader's question: "${query}"
${contextBlock(contexts)}
CURRENT ARTICLE:
"""
${JSON.stringify({ title: currentArticle.title, sections: currentArticle.sections }, null, 2)}
"""

${
  sourceText
    ? `BACKGROUND SOURCE MATERIAL (use this to ground your edits; don't contradict it):\n"""\n${sourceText}\n"""\n`
    : `No source material is available for this question — answer from general knowledge, and mark any edited section's sourceStatus as "generated".\n`
}

Return ONLY valid JSON (no markdown, no explanation):
{
  "answer": string,
  "edits": [
    { "op": "amend", "heading": string, "content": string, "sourceStatus": "source" | "hybrid" | "generated" },
    { "op": "add", "heading": string, "content": string, "sourceStatus": "source" | "hybrid" | "generated" }
  ]
}

Guidelines:
- "answer" is ONLY a direct answer to a question the reader asked — the article holds the detail, so keep it minimal:
  - If the message asks a question, answer it in ONE short sentence (two only if truly necessary), under 25 words.
  - If the message contains no question (e.g. it only asks for an edit), "answer" MUST be "" (empty string).
  - Never describe or mention your edits in "answer" — the app reports changes to the reader separately.
  - Pitch the wording to the EXPLANATION LEVEL below. No greetings, hedging, caveats, or restating the question.
- WHEN TO EDIT — be strict. The default is an empty "edits" array. Only edit if at least one is true:
  1. The reader explicitly asks for a change (add, expand, rewrite, remove, fix, etc.).
  2. The article states something factually wrong, or contradicts the source material.
  3. The answer to the reader's question is genuinely ABSENT from the article — not stated anywhere,
     not even in different words or implied — AND it is substantive, encyclopedic content that belongs
     in the article for any reader (not trivia, and not specific to this reader's situation).
- Do NOT edit when:
  - The answer is already in the article anywhere, even worded differently or only in general terms.
    Answer from it instead.
  - The change would only rephrase, reword, emphasize, restate more "explicitly", or add an example
    of something already covered.
  - The question is a quick clarification, definition, or check of understanding.
  - You are unsure — when in doubt, don't edit.
- "amend" means updating an EXISTING section's content — "heading" must exactly match one of the
  existing headings. This includes adding new information, correcting or removing outdated/inaccurate
  information, or both. The "content" you return for an amend REPLACES the section's content entirely,
  so include everything that should remain — don't assume anything is preserved automatically.
- "add" means a brand new section — pick a heading that doesn't collide with an existing one.
- Only include edits for sections you're actually changing or adding. Do not repeat unchanged sections.
- If the reader's question reveals something in an existing section is wrong, outdated, or contradicted
  by the source material, use "amend" to fix or remove it rather than leaving it and adding a separate
  correcting section.
- If nothing meets the WHEN TO EDIT bar, return an empty "edits" array and just answer.

${levelInstructions(level)}

${markdownGuidelines(policy)}
- The formatting rules apply to the "content" of edits. "answer" is short Markdown text; any math in it is LaTeX ($...$).
- The level applies to "answer" and to the content of any new or amended section. A reader asking to
  change the level of existing text ("explain this more simply") is an explicit request for an amend.

${imageMenuPrompt(images, countImageRefs(currentArticle.sections), policy)}

${examplesPrompt(examples)}${
    examples.length > 0
      ? `\n- The reader asked for examples, so this is an explicit request for an edit: place the examples in the\n  "content" of an amend or add (never in "answer").`
      : ""
  }
`;
}

function extractJson(text) {
  const cleaned = text.trim().replace(/```json/g, "").replace(/```/g, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON found in Gemini response");
  try {
    return JSON.parse(fixJsonEscapes(cleaned.slice(start, end + 1)));
  } catch {
    return JSON.parse(fixJsonEscapes(cleaned));
  }
}

function isValidEdit(edit) {
  return (
    edit &&
    (edit.op === "amend" || edit.op === "add") &&
    typeof edit.heading === "string" &&
    edit.heading.trim().length > 0 &&
    typeof edit.content === "string" &&
    VALID_SOURCE_STATUSES.includes(edit.sourceStatus)
  );
}

// Deterministic merge — the model never touches sections it wasn't given
// permission to edit, so untouched content can't drift.
function applyEdits(currentArticle, edits) {
  const sections = [...currentArticle.sections];
  const usedHeadings = new Set(sections.map((s) => s.heading));
  const changedHeadings = [];
  const addedHeadings = [];
  const amendedHeadings = [];

  for (const edit of edits) {
    const idx = sections.findIndex((s) => s.heading === edit.heading);

    if (edit.op === "amend" && idx !== -1) {
      if (!amendedHeadings.includes(edit.heading)) amendedHeadings.push(edit.heading);
      // Keep the user-edited tag: the amend rewrites on top of the user's text, so both contributed.
      sections[idx] = withExampleProvenance(
        {
          heading: edit.heading,
          content: edit.content,
          sourceStatus: edit.sourceStatus,
          ...(sections[idx].userEdited && { userEdited: true }),
        },
        edit.exampleInserted,
        edit.exampleVerified
      );
      changedHeadings.push(edit.heading);
      continue;
    }

    let heading = edit.heading;
    let suffix = 2;
    while (usedHeadings.has(heading)) {
      heading = `${edit.heading} (${suffix})`;
      suffix += 1;
    }
    usedHeadings.add(heading);
    sections.push(
      withExampleProvenance(
        { heading, content: edit.content, sourceStatus: edit.sourceStatus },
        edit.exampleInserted,
        edit.exampleVerified
      )
    );
    changedHeadings.push(heading);
    addedHeadings.push(heading);
  }

  return { article: { ...currentArticle, sections }, changedHeadings, addedHeadings, amendedHeadings };
}

function quoteList(headings) {
  const quoted = headings.map((h) => `'${h}'`);
  if (quoted.length <= 1) return quoted.join("");
  return `${quoted.slice(0, -1).join(", ")} and ${quoted[quoted.length - 1]}`;
}

// Built from the edits actually applied (not model prose), so it's always
// accurate and always one short line.
function buildChangeNote(addedHeadings, amendedHeadings) {
  const parts = [];
  if (addedHeadings.length > 0) parts.push(`Added ${quoteList(addedHeadings)}.`);
  if (amendedHeadings.length > 0) parts.push(`Updated ${quoteList(amendedHeadings)}.`);
  return parts.join(" ");
}

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { query, history, relevantSections, chatContextStatus, currentArticle } = body;
  const contexts = parseContexts(body.contexts);
  const level = normalizeLevel(body.level);

  if (!query || typeof query !== "string" || !query.trim()) {
    return Response.json({ error: "Missing query" }, { status: 400 });
  }
  if (!currentArticle || typeof currentArticle.title !== "string" || !Array.isArray(currentArticle.sections)) {
    return Response.json({ error: "Missing or invalid currentArticle" }, { status: 400 });
  }

  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "No session" }, { status: 401 });
  }

  const { success: withinLimit } = await userChatRateLimit.limit(user.id);
  if (!withinLimit) {
    return Response.json({ error: "You've sent a lot of messages recently. Try again in a bit." }, { status: 429 });
  }

  const isGrounded =
    chatContextStatus === "grounded" && Array.isArray(relevantSections) && relevantSections.length > 0;

  let sourceText = "";

  if (isGrounded) {
    const uniqueTopics = [...new Set(relevantSections.map((s) => s.topic))];
    const cachedArticles = {};
    await Promise.all(
      uniqueTopics.map(async (name) => {
        const cached = await getCachedArticle(name);
        if (cached) cachedArticles[name] = cached;
      })
    );
    sourceText = buildSourceText(relevantSections, cachedArticles);
    // if empty (cache expired since detect-relevance ran), the prompt's
    // fallback branch below naturally treats this as ungrounded
  }

  // The article's feature selection plus anything this message directly asks
  // for. Never below what the article already has, so an edit can't strip
  // media added earlier (e.g. by a direct request).
  const basePolicy = mediaPolicy(normalizeFeatures(currentArticle.features), requestedFeatures(query));
  const policy = {
    ...basePolicy,
    maxImages: Math.max(basePolicy.maxImages, countImageRefs(currentArticle.sections)),
    maxDiagrams: Math.max(basePolicy.maxDiagrams, countDiagrams(currentArticle.sections)),
  };

  // With parts of the article selected, amends stay inside the selected
  // sections — "rewrite this" must not touch anything else. New sections are
  // still allowed.
  const selectedHeadings = new Set(contexts.map((c) => c.heading));
  const inScope = (edit) => selectedHeadings.size === 0 || edit.op === "add" || selectedHeadings.has(edit.heading);
  const existingHeadings = new Set(currentArticle.sections.map((s) => s.heading));

  // A partial edit is shown live only once it's clearly one the final checks
  // will keep (complete op, a real heading for amends, in scope) — otherwise
  // a section could visibly rewrite and then snap back.
  const isStreamable = (edit) =>
    edit &&
    (edit.op === "amend" || edit.op === "add") &&
    typeof edit.heading === "string" &&
    edit.heading.trim().length > 0 &&
    typeof edit.content === "string" &&
    (edit.op === "add" || existingHeadings.has(edit.heading)) &&
    inScope(edit);

  // Events: { t: "edit", i, op, heading, content } while edits are being
  // written, then { t: "done", ... } with the same payload the non-streaming
  // version returned. The answer itself arrives only with "done".
  return ndjsonResponse(async (send) => {
    // Asked for examples with something to compute: write and code-check them
    // first (see lib/verifiedExamples.js). Otherwise the writer handles them.
    const request = query.trim();
    const context = requestsExamples(request) ? exampleContext(currentArticle, contexts, sourceText) : "";
    const examples =
      context && (await examplesNeedChecking({ request, context, source: "examples-gate" }))
        ? await generateVerifiedExamples({ request, context, level, source: "verify-examples" })
        : [];
    // Directly asked for an image: add Wikimedia Commons results to the menu,
    // since the source articles often don't have a fitting one
    const baseImages = articleImages(currentArticle);
    const images = policy.requested.includes("images")
      ? (await withCommonsImages(baseImages, request, currentArticle.title)).slice(0, MAX_IMAGE_MENU)
      : baseImages;
    const addedImages = images.slice(baseImages.length);

    const prompt = buildAnswerPrompt({
      query: request,
      history,
      currentArticle,
      sourceText,
      contexts,
      level,
      policy,
      images,
      examples,
    });

    let text = "";
    const sentContent = [];

    for await (const chunk of streamGemini({ source: "chatbot-answer", prompt, model: GEMINI_MODEL, json: true })) {
      text += chunk;
      const edits = parsePartialJson(text)?.edits;
      if (!Array.isArray(edits)) continue;
      edits.forEach((edit, i) => {
        if (!isStreamable(edit) || sentContent[i] === edit.content) return;
        sentContent[i] = edit.content;
        const content = insertExamples(repairLatexEscapes(edit.content), examples, new Set(), { partial: true }).content;
        send({ t: "edit", i, op: edit.op, heading: edit.heading, content });
      });
    }

    const parsed = extractJson(text);

    // "answer" may legitimately be "" (edit-only request), but must be a string
    if (!parsed || typeof parsed.answer !== "string") {
      console.error("Malformed chatbot-answer response — missing answer:", parsed);
      throw new Error("AI response is missing an answer");
    }

    // A missing/unknown sourceStatus is labelled "generated" (the most cautious
    // provenance) rather than dropping an edit the reader already saw stream in.
    const usedExamples = new Set();
    const rawEdits = (Array.isArray(parsed.edits) ? parsed.edits : []).map((e) => {
      if (!e || typeof e !== "object") return e;
      let edit = e;
      if (typeof e.content === "string") {
        const { content, inserted, verified } = insertExamples(repairLatexEscapes(e.content), examples, usedExamples);
        edit = { ...e, content, exampleInserted: inserted, exampleVerified: verified };
      }
      return VALID_SOURCE_STATUSES.includes(edit.sourceStatus) ? edit : { ...edit, sourceStatus: "generated" };
    });
    const wellFormedEdits = rawEdits.filter(isValidEdit);

    if (wellFormedEdits.length < rawEdits.length) {
      console.warn(
        `[chatbot-answer] dropped ${rawEdits.length - wellFormedEdits.length} malformed edit(s):`,
        rawEdits.filter((e) => !isValidEdit(e))
      );
    }

    const validEdits = wellFormedEdits.filter(inScope);

    if (validEdits.length < wellFormedEdits.length) {
      console.warn(
        `[chatbot-answer] dropped ${wellFormedEdits.length - validEdits.length} edit(s) outside the selected sections:`,
        wellFormedEdits.filter((e) => !inScope(e)).map((e) => e.heading)
      );
    }

    const { article: mergedArticle, changedHeadings, addedHeadings, amendedHeadings } =
      validEdits.length > 0
        ? applyEdits(currentArticle, validEdits)
        : { article: currentArticle, changedHeadings: [], addedHeadings: [], amendedHeadings: [] };
    // Same media caps as a new article (menu-only images, one diagram). Commons
    // results are kept on the article so later edits can use them too.
    const updatedArticle =
      validEdits.length > 0
        ? {
            ...mergedArticle,
            sections: enforceMediaLimits(mergedArticle.sections, images, policy),
            ...(addedImages.length > 0 && { images: [...(currentArticle.images ?? []), ...addedImages] }),
          }
        : mergedArticle;

    const answer =
      [
        parsed.answer.trim(),
        buildChangeNote(addedHeadings, amendedHeadings),
        unmetRequestNote(policy.requested, updatedArticle.sections),
      ]
        .filter(Boolean)
        .join(" ") ||
      "Nothing in the article needed to change.";

    send({
      t: "done",
      answer,
      article: updatedArticle,
      articleChanged: validEdits.length > 0,
      changedHeadings,
    });
  });
}
