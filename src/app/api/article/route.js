import { redis } from "../../../lib/redis";

async function generateArticle(topic) {
  // Build a strict prompt so the model returns structured article JSON.
  const prompt = `
  You are a Wikipedia-style expert.

  Return ONLY valid JSON (no markdown, no explanation):

  {
    "title": string,
    "overview": string,
    "history": string,
    "keyIdeas": string,
    "impact": string
  }

  Topic: ${topic}
  `;

  // Send the prompt to Gemini for structured content generation.
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/gemini-3.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
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

  // Extract the generated text from the API response.
  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error("No text returned from Gemini API");
  }

  // Clean up the response so we can safely parse the JSON payload.
  let cleaned = text.trim().replace(/```json/g, "").replace(/```/g, "");

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start === -1 || end === -1) {
    console.error("No JSON found in Gemini response:", cleaned);
    throw new Error("Invalid AI response format");
  }

  const jsonString = cleaned.slice(start, end + 1);

  try {
    return JSON.parse(jsonString);
  } catch {
    try {
      return JSON.parse(cleaned);
    } catch (err) {
      console.error("Unable to parse Gemini JSON response:", cleaned);
      throw new Error("Invalid JSON returned from Gemini API");
    }
  }
}

export async function POST(req) {
  try {
    // Read the topic from the incoming JSON request body.
    const { topic } = await req.json();

    if (!topic) {
      return Response.json({ error: "Missing topic" }, { status: 400 });
    }

    // Build a stable cache key for the requested article.
    const key = `article:${topic.toLowerCase().trim().replace(/\s+/g, "-")}`;

    const cached = await redis.get(key);
    if (cached) {
      return Response.json(cached);
    }

    // Generate the article on demand and cache it for one week.
    const aiData = await generateArticle(topic);

    await redis.set(key, aiData, {
      ex: 60 * 60 * 24 * 7,
    });

    return Response.json(aiData);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}