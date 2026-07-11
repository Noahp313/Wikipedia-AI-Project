import { getCachedArticle } from "../../../lib/cache";
import { callGemini } from "../../../lib/geminiClient";

const GEMINI_MODEL = "gemini-3.1-flash-lite";

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

async function detectRelevance(query, articles) {
  const sourceText = buildSourceText(articles);

  const prompt = `
  You identify which sections of the following articles are relevant to a user's query.

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
  - Only include sections that are meaningfully relevant to the query.
  - Use the exact topic and heading strings as given above.
  - If no sections in a topic are relevant, omit that topic entirely.
  `;

  const data = await callGemini({ prompt, model: GEMINI_MODEL });
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

  if (!parsed || !Array.isArray(parsed.relevantSections)) {
    console.error("Gemini response missing relevantSections array:", parsed);
    throw new Error("AI response is missing a relevantSections array");
  }

  return parsed.relevantSections;
}

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { query, topics } = body;

  if (!query || typeof query !== "string" || !query.trim()) {
    return Response.json({ error: "Missing query" }, { status: 400 });
  }

  if (!Array.isArray(topics) || topics.length === 0) {
    return Response.json({ error: "No topics provided" }, { status: 400 });
  }

  const results = await Promise.all(
    topics.map(async (topic) => {
      const cached = await getCachedArticle(topic);
      return cached && Array.isArray(cached.sections) ? { topic, article: cached } : null;
    })
  );

  const articles = results.filter(Boolean);

  if (articles.length === 0) {
    return Response.json({ error: "No cached articles found for given topics" }, { status: 404 });
  }

  try {
    const relevantSections = await detectRelevance(query.trim(), articles);
    return Response.json({ relevantSections });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}