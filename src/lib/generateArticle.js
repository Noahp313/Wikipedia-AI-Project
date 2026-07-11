import { fetchWikipediaContent } from "../lib/wikipedia";
import { parseSections, buildSourceText } from "../lib/wikiSections";
import { callGemini } from "../lib/geminiClient"

const GEMINI_MODEL = "gemini-3.1-flash-lite";

export async function generateArticleForTopic(topic) {
    let sourceText = null;
    let sourceStatus = "no-wikipedia-source";
    let sourceUrl = null;

    const wiki = await fetchWikipediaContent(topic);

    if (wiki.found) {
        const sections = parseSections(wiki.extract);
        sourceText = buildSourceText(sections, 14000);
        sourceStatus = "wikipedia"
        sourceUrl = wiki.sourceUrl;
    }

    const prompt = sourceText
    ? `
    You are a Wikipedia-style expert writer.

    Write an article about: ${topic}

    Use the source material below as your primary source of truth. If it fully covers a section, base that section entirely on it. If the source material is missing something the topic needs (a subtopic, background, comparison, or a section marked as truncated below), you may fill that gap using your own general knowledge — but never contradict the source material where it does speak to a topic.

    SOURCE MATERIAL:
    """
    ${sourceText}
    """

    Return ONLY valid JSON (no markdown, no explanation):

    {
    "title": string,
    "sections": [
        {
        "heading": string,
        "content": string,
        "sourceStatus": "wikipedia" | "generated" | "hybrid"
        }
    ]
    }

    Guidelines:
    - Create 3–6 sections depending on the topic
    - Section titles should be natural (e.g. "History", "Applications", "Causes", "Design", etc.)
    - Adapt sections to the topic (do NOT use fixed headings)
    - Write concise but informative paragraphs
    - Make the first sentence of every section a topic sentence
    - Mark each section's "sourceStatus": "wikipedia" if drawn entirely from the source material, "generated" if it had no coverage in the source and you wrote it from general knowledge, "hybrid" if it mixes both
    - If the source material for a section is marked [TRUNCATED] or is only a partial summary, treat it as a starting point and complete the section using general knowledge, marking that section "hybrid"
    - Never state something as fact if it isn't supported by the source material or well-established general knowledge
    `
    : `
    You are a Wikipedia-style expert writer.

    Write an article about: ${topic}

    Return ONLY valid JSON (no markdown, no explanation):

    {
    "title": string,
    "sections": [
        {
        "heading": string,
        "content": string,
        "sourceStatus": "generated"
        }
    ]
    }

    Guidelines:
    - Create 3–6 sections depending on the topic
    - Section titles should be natural (e.g. "History", "Applications", "Causes", "Design", etc.)
    - Adapt sections to the topic (do NOT use fixed headings)
    - Write concise but informative paragraphs
    - Every section's "sourceStatus" should be "generated" since no source material was available
    `;
    
    const data = await callGemini({ prompt, model: GEMINI_MODEL});
    
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

    return {
        ...parsed,
        sourceStatus,
        sourceUrl,
    };
}
