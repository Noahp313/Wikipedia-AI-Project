async function detectTopics(query) {
  const prompt = `
  You extract the main encyclopedia-style topic(s) from a search query.

  Query: "${query}"

  Return ONLY valid JSON (no markdown, no explanation):

  {
    "topics": string[]
  }

  Rules:
  - A valid topic is something that could plausibly be its own encyclopedia
    article (a person, place, concept, event, object, etc).
  - Do NOT extract themes, angles, qualities, or scoping context as topics
    (e.g. "effects", "daily life", "implications", "in Britain"). These
    narrow or contextualize a topic but are not topics themselves.
  - Only return more than one topic if the query is genuinely asking about
    the relationship between two independent subjects — i.e. removing
    either term would gut the question entirely, not just narrow it.
    Test: "industrial revolution in Britain" -> removing "Britain" still
    leaves a coherent, still-relevant question (just broader). One topic:
    ["industrial revolution"]. "Gravity and electromagnetism" -> removing
    either term destroys the actual question being asked. Two topics:
    ["gravity", "electromagnetism"].
  - If the query is too vague to extract any real topic, return an empty
    array rather than guessing.
  - Only extract topics explicitly named or unambiguously implied. Do not
    infer related entities that aren't actually mentioned (e.g. don't add
    "SpaceX" or "Tesla" just because "Elon Musk's companies" was the query
    — that inference belongs to a later stage, not this one).
  - Preserve natural casing/spelling for each topic (don't slugify here).
  - if returning multiple topics, order them by how central each is to the 
    query, with the most central topic first.
  `;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/gemini-3.1-flash-lite:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error(
      "Gemini API request failed:",
      response.status,
      response.statusText,
      errorText
    );
    throw new Error("Gemini API request failed");
  }

  const data = await response.json();
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