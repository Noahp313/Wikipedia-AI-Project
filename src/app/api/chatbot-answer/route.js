import { getCachedArticle } from "../../../lib/cache";
import { callGemini } from "../../../lib/geminiClient";

const GEMINI_MODEL = "gemini-3.1-flash-lite";
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

function buildAnswerPrompt({ query, history, currentArticle, sourceText }) {
  return `
You are updating a Wikipedia-style article in response to a reader's follow-up question.
You are given the CURRENT ARTICLE for context. Return a direct answer plus a list of EDITS —
usually none. Most questions should be answered WITHOUT changing the article.

${historyBlock(history) ? `CONVERSATION SO FAR:\n${historyBlock(history)}\n` : ""}
Reader's question: "${query}"

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
  - Plain everyday language, no jargon unless the reader used it first. No greetings, hedging, caveats, or restating the question.
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
`;
}

function extractJson(text) {
  const cleaned = text.trim().replace(/```json/g, "").replace(/```/g, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON found in Gemini response");
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return JSON.parse(cleaned);
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
      sections[idx] = {
        heading: edit.heading,
        content: edit.content,
        sourceStatus: edit.sourceStatus,
        ...(sections[idx].userEdited && { userEdited: true }),
      };
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
    sections.push({ heading, content: edit.content, sourceStatus: edit.sourceStatus });
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

  if (!query || typeof query !== "string" || !query.trim()) {
    return Response.json({ error: "Missing query" }, { status: 400 });
  }
  if (!currentArticle || typeof currentArticle.title !== "string" || !Array.isArray(currentArticle.sections)) {
    return Response.json({ error: "Missing or invalid currentArticle" }, { status: 400 });
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

  const prompt = buildAnswerPrompt({ query: query.trim(), history, currentArticle, sourceText });

  try {
    const data = await callGemini({ prompt, model: GEMINI_MODEL });
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("No text returned from Gemini API");

    const parsed = extractJson(text);

    // "answer" may legitimately be "" (edit-only request), but must be a string
    if (!parsed || typeof parsed.answer !== "string") {
      console.error("Malformed chatbot-answer response — missing answer:", parsed);
      throw new Error("AI response is missing an answer");
    }

    const rawEdits = Array.isArray(parsed.edits) ? parsed.edits : [];
    const validEdits = rawEdits.filter(isValidEdit);

    if (validEdits.length < rawEdits.length) {
      console.warn(
        `[chatbot-answer] dropped ${rawEdits.length - validEdits.length} malformed edit(s):`,
        rawEdits.filter((e) => !isValidEdit(e))
      );
    }

    const { article: updatedArticle, changedHeadings, addedHeadings, amendedHeadings } =
      validEdits.length > 0
        ? applyEdits(currentArticle, validEdits)
        : { article: currentArticle, changedHeadings: [], addedHeadings: [], amendedHeadings: [] };

    const answer =
      [parsed.answer.trim(), buildChangeNote(addedHeadings, amendedHeadings)].filter(Boolean).join(" ") ||
      "Nothing in the article needed to change.";

    return Response.json({
      answer,
      article: updatedArticle,
      articleChanged: validEdits.length > 0,
      changedHeadings,
    });
  } catch (err) {
    console.error("[chatbot-answer] error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}