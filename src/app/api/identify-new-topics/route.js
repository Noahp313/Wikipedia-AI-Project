import { getCachedArticle } from "../../../lib/cache";
import { callGemini } from "../../../lib/geminiClient";

const GEMINI_MODEL = "gemini-3.1-flash-lite";

function getFirstSentence(text) {
  const match = text.match(/^.*?[.!?](\s|$)/);
  return match ? match[0].trim() : text.trim();
}

function assembleSourceText(topicName, cachedArticle) {
  const sectionsText = cachedArticle.sections
    .map((s) => `Section: ${s.heading}\nContent: ${getFirstSentence(s.content)}`)
    .join("\n\n");

  return `Topic: ${topicName}\n${sectionsText}`;
}

function buildNewTopicPrompt(message, sourceText) {
  return `
  You are checking whether a user's message stays within the general subject of an article, or clearly shifts to a different topic.

  User message: "${message}"

  EXISTING SOURCE MATERIAL (topic summaries):
  """
  ${sourceText}
  """

  Return ONLY valid JSON (no markdown, no explanation):
  {
    "newTopicNecessary": boolean,
    "newTopics": string[]
  }

  Guidelines:
  - "newTopicNecessary" is true ONLY if the message shifts to a subject outside the general scope of the source material — not merely because a specific detail, entity, or example isn't literally mentioned in the summaries above.
  - FIRST check: does the message name a specific real-world entity (person, place, organization, work, event) OR a specific named concept, theory, principle, or technical term (e.g. "Nash equilibrium", "photosynthesis", "the Pythagorean theorem") that would have its own independent Wikipedia article regardless of whether this topic existed? If yes, set true — even if that entity or concept is closely related to, commonly discussed alongside, or a component of the article's subject. Relatedness does NOT override independent notability. (e.g. "what does St. Thomas Aquinas think about this" → true, newTopics: ["Thomas Aquinas"], even though he's closely tied to "meaning of life." Similarly "what is the Nash equilibrium" asked on a "Game theory" article → true, newTopics: ["Nash equilibrium"], since it's a named concept with its own standalone article, not a generic sub-question.)
  - Only default to false for things that would NOT have their own standalone article independent of this topic — generic, unnamed facets, causes, effects, or components that only exist in relation to the article's subject and aren't themselves a specific named concept (e.g. "what caused this," "what were the effects," "how does this work" → false, these are generic sub-questions about the same topic, not named entities or concepts).
  - If true, "newTopics" must be an array of exact titles of real, existing Wikipedia articles relevant to answering the question. If the user's message misspells the entity's name, correct it to the actual article title (e.g. user writes "Napolean" -> newTopics: ["Napoleon"]) — the title must always be the correct standard spelling, regardless of how the user typed it. Include the underlying concept or mechanism (b) only in addition to a named entity (a), and only when that concept is itself a separate, real subject — not a restatement of the entity already named.
  - Do not invent a plausible-sounding title — only include titles you are confident correspond to an actual Wikipedia article.
  - If false, "newTopics" must be an empty array.
  `;
}

async function checkNewTopic(message, sourceText) {
  const prompt = buildNewTopicPrompt(message, sourceText);

  const data = await callGemini({ prompt, model: GEMINI_MODEL });
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error("No text returned from Gemini API");
  }

  let cleaned = text.trim().replace(/```json/g, "").replace(/```/g, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start === -1 || end === -1) {
    console.error("No JSON found in checkNewTopic response:", cleaned);
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
      console.error("Unable to parse checkNewTopic JSON response:", cleaned);
      throw new Error("Invalid JSON returned from Gemini API");
    }
  }

  if (typeof parsed?.newTopicNecessary !== "boolean") {
    console.error("checkNewTopic response missing valid newTopicNecessary:", parsed);
    throw new Error("AI response is missing a valid newTopicNecessary flag");
  }

  if (!Array.isArray(parsed.newTopics)) {
    parsed.newTopics = [];
  }

  if (parsed.newTopicNecessary && parsed.newTopics.length === 0) {
    console.error("checkNewTopic response missing newTopics despite newTopicNecessary=true:", parsed);
    throw new Error("AI response is missing newTopics");
  }

  if (!parsed.newTopicNecessary) {
    parsed.newTopics = [];
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

  const { message, sourceTopics } = body;

  if (!message || typeof message !== "string" || !message.trim()) {
    return Response.json({ error: "Missing message" }, { status: 400 });
  }

  if (!Array.isArray(sourceTopics)) {
    return Response.json({ error: "sourceTopics must be an array" }, { status: 400 });
  }

  let sourceText = "";

  if (sourceTopics.length > 0) {
    const results = await Promise.all(
        sourceTopics.map(async (topicName) => {
        const cached = await getCachedArticle(topicName);
        if (!cached || !Array.isArray(cached.sections)) return null;
        return assembleSourceText(topicName, cached);
        })
    );

    sourceText = results.filter(Boolean).join("\n\n");
  }

  

  try {
    const { newTopicNecessary, newTopics } = await checkNewTopic(message, sourceText);
    return Response.json({ newTopicNecessary, newTopics });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}