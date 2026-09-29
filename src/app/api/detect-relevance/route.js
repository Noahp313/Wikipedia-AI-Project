import { getCachedArticle } from "../../../lib/cache";
import { detectRelevantSections } from "../../../lib/detectRelevance";
import { recordPipelineEvent } from "../../../lib/devTelemetry";

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
    // No source material made it into the cache (e.g. every topic failed to
    // generate) — fall back to ungrounded generation instead of failing the
    // whole pipeline, same as the "cached but nothing relevant" case below.
    recordPipelineEvent("search-relevance:no-cached-articles");
    return Response.json({ relevantSections: [], developmentSourceStatus: "no-relevant-sections" });
  }

  try {
    const relevantSections = await detectRelevantSections(query.trim(), articles);

    const developmentSourceStatus =
      relevantSections.length > 0 ? "grounded" : "no-relevant-sections";

    if (developmentSourceStatus === "no-relevant-sections") {
      console.log("[detect-relevance] no relevant sections", {
        query: query.trim(),
        topics: articles.map((a) => a.topic),
      });
    }

    recordPipelineEvent(`search-relevance:${developmentSourceStatus}`);
    return Response.json({ relevantSections, developmentSourceStatus });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}