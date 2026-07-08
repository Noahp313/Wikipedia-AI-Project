const WIKI_API = "https://en.wikipedia.org/w/api.php";
const USER_AGENT = "WikAi/1.0 (noahp0313@outlook.com)";

export async function fetchWikipediaContent(topic) {
    const canonicalTitle = await resolveTitle(topic);

    if (!canonicalTitle) {
        return { found: false };
    }

    const extract = await fetchExtract(canonicalTitle);

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
    
    return titles && titles.length > 0 ? titles[0] : null; // Return the first search result
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