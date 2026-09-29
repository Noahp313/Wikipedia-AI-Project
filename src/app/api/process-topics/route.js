import { NextResponse } from "next/server";
import { generateArticleForTopic } from "../../../lib/generateArticle";
import { getCachedArticle, setCachedArticle } from "../../../lib/cache";
import { recordPipelineEvent } from "../../../lib/devTelemetry";

const MAX_CONCURRENT = 2; // tune based on your Gemini tier's rate limit

async function processTopic(topic) {
  const cached = await getCachedArticle(topic);
  if (cached) {
    recordPipelineEvent("topic:cache-hit");
    return { topic, status: "cache-hit" };
  }

  // Retry/backoff/model-fallback live in callGemini (geminiClient.js) —
  // whatever it throws here is final for this topic.
  const article = await generateArticleForTopic(topic);
  await setCachedArticle(topic, article);
  recordPipelineEvent("topic:generated", `topic-source:${article.sourceStatus}`);

  return {
    topic,
    status: "generated",
    sourceStatus: article.sourceStatus,
  };
}

// Runs an array of async tasks with a concurrency cap, preserving order and
// returning allSettled-style results.
async function processWithConcurrencyLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function runNext() {
    while (cursor < items.length) {
      const index = cursor++;
      try {
        results[index] = { status: "fulfilled", value: await worker(items[index]) };
      } catch (err) {
        results[index] = { status: "rejected", reason: err };
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, runNext);
  await Promise.all(workers);

  return results;
}

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

  const uniqueTopics = [...new Set(topics.map((t) => t.trim().toLowerCase()))].filter(Boolean);

  const results = await processWithConcurrencyLimit(uniqueTopics, MAX_CONCURRENT, processTopic);

  const summary = results.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : { topic: uniqueTopics[i], status: "error", error: r.reason?.message ?? "Unknown error" }
  );

  const failureCount = summary.filter((s) => s.status === "error").length;
  if (failureCount > 0) recordPipelineEvent(...Array(failureCount).fill("topic:error"));
  const hasFailures = failureCount > 0;

  return NextResponse.json(
    { processed: summary },
    { status: hasFailures ? 207 : 200 }
  );
}