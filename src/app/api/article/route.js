import { redis } from "../../../lib/redis";
import { slugify } from "../../../lib/slugify";

async function generateArticle(topic) {
  const prompt = `
  You are a Wikipedia-style expert.

  Write an article about: ${topic}

  Return ONLY valid JSON (no markdown, no explanation):

  {
    "title": string,
    "sections": [
      {
        "heading": string,
        "content": string
      }
    ]
  }

  Guidelines:
  - Create 3–6 sections depending on the topic
  - Section titles should be natural (e.g. "History", "Applications", "Causes", "Design", etc.)
  - Adapt sections to the topic (do NOT use fixed headings)
  - Write concise but informative paragraphs
  `;

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

  if (!parsed || !Array.isArray(parsed.sections)) {
    console.error("Gemini response missing sections array:", parsed);
    throw new Error("AI response is missing a sections array");
  }

  return parsed;
}

export async function POST(req) {
  try {
    const { topic } = await req.json();

    if (!topic) {
      return Response.json({ error: "Missing topic" }, { status: 400 });
    }

    const key = `article:${slugify(topic)}`;

    const cached = await redis.get(key);
    if (cached) {
      return Response.json(cached);
    }

    const aiData = await generateArticle(topic);

    await redis.set(key, aiData, {
      ex: 60 * 60 * 24 * 7,
    });

    return Response.json(aiData);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}