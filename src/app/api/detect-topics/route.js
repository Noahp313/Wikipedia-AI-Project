import { callGemini } from "../../../lib/geminiClient";

async function detectTopics(query) {
  const GEMINI_MODEL = "gemini-3.1-flash-lite";

  const prompt = `
  You extract the main encyclopedia-style topic(s) from a search query.

  Query: "${query}"

  Return ONLY valid JSON (no markdown, no explanation):
  { "topics": string[] }

  Rules:
  - A topic is something that could be its own encyclopedia article (person, place, concept, event, object). Don't extract themes/angles/scoping context (e.g. "effects", "in Britain") as topics.
  - Multiple topics only if removing either one would gut the question, not just narrow it (e.g. "gravity and electromagnetism" -> both; "industrial revolution in Britain" -> just ["industrial revolution"]).
  - Empty array if query is too vague to extract a real topic.
  - Only extract what's explicitly named — don't infer related entities (e.g. "Elon Musk's companies" ≠ add "Tesla").
  - Correct obvious spelling errors to the standard spelling of the entity (e.g. "Napolean" -> "Napoleon", "Einstien" -> "Einstein"). Only fix clear typos — don't "correct" alternate valid spellings, transliterations, or names you're not confident about.
  - Preserve natural casing. Order by centrality, most central first.

  Descriptions vs. real titles: queries are often descriptions of a topic
  rather than its actual article title (e.g. "[aspect] of [entity]", "fall of
  [entity]"). Collapse these to the ENTITY, even for well-known events:
  - "economics of the USSR" -> "Soviet Union"
  - "fall of the USSR" -> "Soviet Union"
  - "fall of Rome" -> "Rome"

  Exception: if the query itself IS a real standalone article title, keep it as-is:
  - "Cold War" -> "Cold War"
  - "Fall of Constantinople" -> "Fall of Constantinople"

  If unsure whether something is a real title or just a description, default to collapsing to the entity.
  `;

  const data = await callGemini({ prompt, model: GEMINI_MODEL, json: true, temperature: 0 });
  
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
    } catch (err) {
      console.error("Unable to parse Gemini JSON response:", cleaned);
      throw new Error("Invalid JSON returned from Gemini API");
    }
  }

  if (!parsed || !Array.isArray(parsed.topics)) {
    console.error("Gemini response missing topics array:", parsed);
    throw new Error("AI response is missing a topics array");
  }

  return parsed.topics;
}

export async function POST(req) {
  try {
    const { query } = await req.json();

    if (!query || typeof query !== "string" || !query.trim()) {
      return Response.json({ error: "Missing query" }, { status: 400 });
    }

    const topics = await detectTopics(query.trim());
    
    return Response.json({ topics });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}