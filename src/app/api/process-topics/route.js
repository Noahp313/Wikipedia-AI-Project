import { NextResponse } from "next/server";
import { generateArticleForTopic } from "../../../lib/generateArticle";
import { getCachedArticle, setCachedArticle } from "../../../lib/cache";

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { topics } = body;

  if (!Array.isArray(topics) || topics.length === 0) {
    return NextResponse.json({ error: "No topics provided" }, { status: 400 });
  }

  // De-dupe in case detect-topics returns the same topic twice
  const uniqueTopics = [...new Set(topics.map((t) => t.trim().toLowerCase()))].filter(Boolean);

  const results = await Promise.allSettled(
    uniqueTopics.map(async (topic) => {
      const cached = await getCachedArticle(topic);
      if (cached) {
        return { topic, status: "cache-hit" };
      }

      const article = await generateArticleForTopic(topic);
      await setCachedArticle(topic, article);

      return {
        topic,
        status: "generated",
        sourceStatus: article.sourceStatus,
      };
    })
  );

  const summary = results.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : { topic: uniqueTopics[i], status: "error", error: r.reason?.message ?? "Unknown error" }
  );

  const hasFailures = summary.some((s) => s.status === "error");

  return NextResponse.json(
    { processed: summary },
    { status: hasFailures ? 207 : 200 } // 207 Multi-Status: some succeeded, some didn't
  );
}