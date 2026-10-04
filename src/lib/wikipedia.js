import { callGemini } from "./geminiClient";
import { WIKI_USER_AGENT } from "./wikiUserAgent";

const WIKI_API = "https://en.wikipedia.org/w/api.php";
const USER_AGENT = WIKI_USER_AGENT;
const PICKER_MODEL = "gemini-3.1-flash-lite";

export async function fetchWikipediaContent(topic) {
    let canonicalTitle = await resolveTitle(topic);
    let extract = canonicalTitle ? await fetchExtract(canonicalTitle) : null;

    // opensearch only matches title prefixes, so descriptive names like
    // "Algebra of limits theorem" miss. Fall back to full-text search + LLM pick.
    if (!extract) {
        canonicalTitle = await pickTitleFromSearch(topic);
        extract = canonicalTitle ? await fetchExtract(canonicalTitle) : null;
    }

    if (!extract) {
        return { found: false };
    }

    return {
        found: true,
        title: canonicalTitle,
        extract,
        sourceUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(canonicalTitle.replace(/ /g, "_"))}`,
    };
}

async function resolveTitle(topic) {
    const params = new URLSearchParams({
        action: "opensearch",
        search: topic,
        limit: "1",
        namespace: "0",
        format: "json",
    });

    const res = await fetch(`${WIKI_API}?${params}`, {
        headers: {
            "User-Agent": USER_AGENT
        }
    });

    if (!res.ok)  return null;

    const data = await res.json();
    const titles = data[1]
    
    return titles && titles.length > 0 ? titles[0] : null;
}

async function fetchExtract(title) {
    const params = new URLSearchParams({
        action: "query",
        prop: "extracts",
        explaintext: "1",
        exsectionformat: "wiki",
        redirects: "1",
        titles: title,
        format: "json",
    });

    const res = await fetch(`${WIKI_API}?${params}`, {
        headers: {
            "User-Agent": USER_AGENT
        }
    });

    if (!res.ok)  return null;

    const data = await res.json();
    const pages = data.query?.pages;
    if (!pages) return null;

    const page = Object.values(pages)[0];

    if (!page || page.missing !== undefined || !page.extract) {
        return null;
    }

    return page.extract;
}

async function searchTitles(topic) {
    const params = new URLSearchParams({
        action: "query",
        list: "search",
        srsearch: topic,
        srlimit: "8",
        srprop: "snippet",
        format: "json",
    });

    const res = await fetch(`${WIKI_API}?${params}`, {
        headers: {
            "User-Agent": USER_AGENT
        }
    });

    if (!res.ok) return [];

    const data = await res.json();

    return (data.query?.search ?? []).map((r) => ({
        title: r.title,
        snippet: r.snippet.replace(/<[^>]+>/g, ""),
    }));
}

// Returns a title for fetchExtract to verify — the model may name an article
// outside the search results, so a hallucinated title just comes back missing.
async function pickTitleFromSearch(topic) {
    try {
        const candidates = await searchTitles(topic);
        const candidateList = candidates.length > 0
            ? candidates.map((c) => `- ${c.title}: ${c.snippet}`).join("\n")
            : "(no results)";

        const prompt = `
        You map a topic to the English Wikipedia article that best covers it.

        Topic: "${topic}"

        Search results:
        ${candidateList}

        Return ONLY JSON: { "title": string | null }

        Rules:
        - Prefer a title from the search results if one actually covers the topic (as its main subject or as a major section).
        - If none do, you may name a different existing English Wikipedia article you are confident covers it (e.g. a named theorem usually covered inside a broader article -> that article).
        - Do NOT pick an article just because it shares words with the topic (e.g. "algebra of limits" is not "Central limit theorem").
        - If you are not confident any article covers the topic, return null.
        `;

        const data = await callGemini({ source: "wikipedia-title-picker", prompt, model: PICKER_MODEL, json: true, temperature: 0 });
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        const title = text ? JSON.parse(text).title : null;

        return typeof title === "string" && title.trim() ? title.trim() : null;
    } catch (err) {
        // A failed lookup shouldn't fail the article — fall through to no-source generation.
        console.error(`[wikipedia] title picker failed for "${topic}":`, err.message);
        return null;
    }
}
