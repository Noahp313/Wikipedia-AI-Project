import { callGemini } from "./geminiClient";

const DEFAULT_MODEL = "gemini-3.1-flash-lite";
const MAX_HISTORY_TURNS = 4;

function getTopicSentence(content) {
  const match = content.match(/.*?[.!?](\s|$)/);
  return match ? match[0].trim() : content.slice(0, 200);
}

function buildSourceText(articles) {
  return articles
    .map(({ topic, article }) => {
      const sectionLines = article.sections
        .map((s) => `  - ${s.heading}: ${getTopicSentence(s.content)}`)
        .join("\n");
      return `Topic: ${topic}\nSections:\n${sectionLines}`;
    })
    .join("\n\n");
}

function buildHistoryText(history) {
  if (!Array.isArray(history) || history.length === 0) return "";

  const recent = history.slice(-MAX_HISTORY_TURNS);
  const lines = recent
    .map((turn) => {
      const role = turn.role === "assistant" ? "Assistant" : "User";
      return `${role}: ${turn.content}`;
    })
    .join("\n");

  return `\n  Recent conversation (for resolving references like "it", "that", "its economy"):\n  """\n  ${lines}\n  """\n`;
}

function buildCurrentArticleText(currentTopic) {
  if (!currentTopic) return "";
  return `\n  The user is currently viewing the article on: "${currentTopic}". Prefer this topic when the query is ambiguous or uses pronouns.\n`;
}

function buildPrompt(query, sourceText, { history, currentTopic } = {}) {
  const historyText = buildHistoryText(history);
  const currentArticleText = buildCurrentArticleText(currentTopic);

  return `
  You identify which sections of the following articles are relevant to a user's query.
  ${currentArticleText}${historyText}
  Query: "${query}"

  Articles:
  """
  ${sourceText}
  """

  Return ONLY valid JSON (no markdown, no explanation):
  {
    "relevantSections": [
      { "topic": string, "heading": string }
    ]
  }

  Rules:
  - Resolve pronouns and vague references ("it", "that", "its economy") using the conversation and current article context above, if provided.
  - Only include sections that are meaningfully relevant to the resolved query.
  - Use the exact topic and heading strings as given above.
  - If no sections in a topic are relevant, omit that topic entirely.
  `;
}

function parseRelevantSections(text) {
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

  if (!parsed || !Array.isArray(parsed.relevantSections)) {
    console.error("Gemini response missing relevantSections array:", parsed);
    throw new Error("AI response is missing a relevantSections array");
  }

  return parsed.relevantSections;
}

export async function detectRelevantSections(
  query,
  articles,
  { model = DEFAULT_MODEL, history, currentTopic } = {}
) {
  const sourceText = buildSourceText(articles);
  const prompt = buildPrompt(query, sourceText, { history, currentTopic });
  console.log(prompt)

  const data = await callGemini({ prompt, model });
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error("No text returned from Gemini API");
  }

  return parseRelevantSections(text);
}