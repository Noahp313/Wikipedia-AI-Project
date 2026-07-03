import { redis } from "../../../lib/redis";

/**
 * Generates an AI-powered Wikipedia-style article using the Google Gemini API.
 *
 * Process:
 * 1. Sends a structured prompt to Gemini requesting JSON format
 * 2. Parses and validates the JSON response
 * 3. Handles malformed responses and formatting issues
 * 4. Returns structured article with title and sections
 *
 * @param {string} topic - The topic/subject for the article
 * @returns {Promise<Object>} Article object with title and sections array
 * @throws {Error} If API request fails or response cannot be parsed
 */
async function generateArticle(topic) {
  // Structured prompt that enforces JSON output format for the AI model
  // This ensures consistent, parseable responses from Gemini
  const prompt = `
  You are a Wikipedia-style expert.

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

  // Make request to Google Gemini API for content generation
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

  // Handle API request errors
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

  // Extract generated text from the Gemini API response
  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error("No text returned from Gemini API");
  }

  // Clean up the response to extract valid JSON
  // Removes markdown code blocks and extra formatting that Gemini may add
  let cleaned = text.trim().replace(/```json/g, "").replace(/```/g, "");

  // Find the JSON object boundaries in the response
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start === -1 || end === -1) {
    console.error("No JSON found in Gemini response:", cleaned);
    throw new Error("Invalid AI response format");
  }

  // Extract the JSON substring
  const jsonString = cleaned.slice(start, end + 1);

  // Attempt to parse JSON with fallback strategies
  try {
    return JSON.parse(jsonString);
  } catch {
    // Fallback: Try parsing the entire cleaned string
    try {
      return JSON.parse(cleaned);
    } catch (err) {
      console.error("Unable to parse Gemini JSON response:", cleaned);
      throw new Error("Invalid JSON returned from Gemini API");
    }
  }
}

/**
 * API endpoint for fetching or generating Wikipedia-style articles.
 *
 * Workflow:
 * 1. Receives POST request with topic parameter
 * 2. Checks Redis cache for existing article
 * 3. If cached, returns cached content immediately
 * 4. If not cached, generates new article using Gemini AI
 * 5. Caches the generated article for 7 days
 * 6. Returns the article to the client
 *
 * Cache Key Format: `article:{topic-slug}` (e.g., "article:artificial-intelligence")
 * Cache TTL: 7 days (604,800 seconds)
 *
 * @param {Request} req - Next.js API request object containing topic in JSON body
 * @returns {Response} JSON response with article data or error message
 */
export async function POST(req) {
  try {
    // Parse the incoming request body to extract the topic
    const { topic } = await req.json();

    // Validate that topic parameter is provided
    if (!topic) {
      return Response.json({ error: "Missing topic" }, { status: 400 });
    }

    // Create a consistent cache key from the topic
    // Normalized: lowercase, trimmed, spaces replaced with hyphens
    const key = `article:${topic.toLowerCase().trim().replace(/\s+/g, "-")}`;

    // Check if article is already cached in Redis
    const cached = await redis.get(key);
    if (cached) {
      // Return cached article immediately (fast response)
      return Response.json(cached);
    }

    // Article not cached - generate new one using AI
    const aiData = await generateArticle(topic);

    // Store generated article in Redis cache for 7 days (604,800 seconds)
    // This reduces API calls and improves response time for popular topics
    await redis.set(key, aiData, {
      ex: 60 * 60 * 24 * 7, // 7 days in seconds
    });

    // Return the newly generated article
    return Response.json(aiData);
  } catch (err) {
    // Return error response with appropriate status code
    return Response.json({ error: err.message }, { status: 500 });
  }
}