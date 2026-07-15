import { getCachedArticle } from "../../../lib/cache";
import { detectRelevantSections } from "../../../lib/detectRelevance";

function isValidHistory(history) {
  return (
    Array.isArray(history) &&
    history.every(
      (turn) =>
        turn &&
        typeof turn.content === "string" &&
        (turn.role === "user" || turn.role === "assistant")
    )
  );
}

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { query, usedTopics, model, history, currentTopic } = body;

  if (!query || typeof query !== "string" || !query.trim()) {
    return Response.json({ error: "Missing query" }, { status: 400 });
  }

  if (!Array.isArray(usedTopics)) {
    return Response.json({ error: "usedTopics must be an array" }, { status: 400 });
  }

  if (history !== undefined && !isValidHistory(history)) {
    return Response.json(
      { error: "history must be an array of { role: 'user'|'assistant', content: string }" },
      { status: 400 }
    );
  }

  if (currentTopic !== undefined && typeof currentTopic !== "string") {
    return Response.json({ error: "currentTopic must be a string" }, { status: 400 });
  }

  const results = await Promise.all(
    usedTopics.map(async (topic) => {
      const cached = await getCachedArticle(topic);
      return cached && Array.isArray(cached.sections) ? { topic, article: cached } : null;
    })
  );

  const articles = results.filter(Boolean);

  if (articles.length === 0) {
    // Nothing to search against — either an ungrounded article with no
    // sourceTopics, or every cached topic has expired. Not an error case;
    // just means there's no source-grounded answer available.
    return Response.json({ relevantSections: [], chatContextStatus: "no-relevant-sections" });
  }

  try {
    const relevantSections = await detectRelevantSections(query.trim(), articles, {
      ...(model ? { model } : {}),
      history,
      currentTopic,
    });

    const chatContextStatus =
      relevantSections.length > 0 ? "grounded" : "no-relevant-sections";

    if (chatContextStatus === "no-relevant-sections") {
      console.log("[chatbot-detect-relevance] no relevant sections", {
        query: query.trim(),
        usedTopics: articles.map((a) => a.topic),
      });
    }

    console.log(relevantSections)
    return Response.json({ relevantSections, chatContextStatus });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}