import { after } from "next/server";
import { redis } from "../lib/redis";

// Telemetry for the developer dashboard (/dev). Two stores:
//   dev:gemini-events      — capped list of the most recent Gemini calls (one event each)
//   dev:stats:<YYYY-MM-DD> — per-day hash of counters (calls/tokens per model, pipeline outcomes)
// Writes are best-effort: they run after the response and never throw into the caller.

export const GEMINI_EVENTS_KEY = "dev:gemini-events";
export const MAX_GEMINI_EVENTS = 2000;
const STATS_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export function statsKey(date = new Date()) {
    return `dev:stats:${date.toISOString().slice(0, 10)}`;
}

function runInBackground(task) {
    const run = () =>
        task().catch((err) => console.error("[devTelemetry] write failed:", err));

    try {
        // Keeps the write alive after the response on serverless platforms.
        after(run);
    } catch {
        // Called outside a request scope (e.g. a script) — just fire it.
        run();
    }
}

export function recordGeminiCall(event) {
    const day = statsKey(new Date(event.timestamp));

    runInBackground(() =>
        redis
            .pipeline()
            .lpush(GEMINI_EVENTS_KEY, event)
            .ltrim(GEMINI_EVENTS_KEY, 0, MAX_GEMINI_EVENTS - 1)
            .hincrby(day, `calls:${event.model}`, 1)
            .hincrby(day, `tokens-in:${event.model}`, event.inputTokens)
            .hincrby(day, `tokens-out:${event.model}`, event.outputTokens)
            .expire(day, STATS_TTL_SECONDS)
            .exec()
    );
}

// Increments one or more daily counters, e.g. "search-relevance:grounded".
export function recordPipelineEvent(...fields) {
    const day = statsKey();

    runInBackground(() => {
        const pipeline = redis.pipeline();
        for (const field of fields) pipeline.hincrby(day, field, 1);
        pipeline.expire(day, STATS_TTL_SECONDS);
        return pipeline.exec();
    });
}
