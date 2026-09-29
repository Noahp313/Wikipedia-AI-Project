import { redis } from "../lib/redis";
import { GEMINI_EVENTS_KEY, MAX_GEMINI_EVENTS, statsKey } from "../lib/devTelemetry";

// Read side of devTelemetry, plus a scan of cached base articles. Only
// called from the auth-gated /dev page.

const MAX_BASE_ARTICLES = 500;

export async function getGeminiEvents() {
    try {
        return (await redis.lrange(GEMINI_EVENTS_KEY, 0, MAX_GEMINI_EVENTS - 1)) ?? [];
    } catch (err) {
        console.error("[devDashboard] failed to load Gemini events:", err);
        return [];
    }
}

// Newest day first: [{ date: "YYYY-MM-DD", fields: { "calls:gemini-…": 12, … } }]
export async function getDailyStats(days = 14) {
    const dates = Array.from({ length: days }, (_, i) => new Date(Date.now() - i * 86_400_000));
    try {
        const pipeline = redis.pipeline();
        for (const d of dates) pipeline.hgetall(statsKey(d));
        const results = await pipeline.exec();
        return dates.map((d, i) => ({
            date: d.toISOString().slice(0, 10),
            fields: Object.fromEntries(
                Object.entries(results[i] ?? {}).map(([k, v]) => [k, Number(v) || 0])
            ),
        }));
    } catch (err) {
        console.error("[devDashboard] failed to load daily stats:", err);
        return [];
    }
}

// Per-topic articles from generateArticle live at article:<slug> (see cache.js).
export async function getCachedBaseArticles() {
    try {
        const keys = [];
        let cursor = "0";
        do {
            const [next, batch] = await redis.scan(cursor, { match: "article:*", count: 200 });
            keys.push(...batch);
            cursor = String(next);
        } while (cursor !== "0" && keys.length < MAX_BASE_ARTICLES);

        const limited = keys.slice(0, MAX_BASE_ARTICLES);
        const articles = [];
        for (let i = 0; i < limited.length; i += 50) {
            const chunk = limited.slice(i, i + 50);
            const values = await redis.mget(...chunk);
            values.forEach((article, j) => {
                if (article && Array.isArray(article.sections)) {
                    articles.push({ key: chunk[j].slice("article:".length), ...article });
                }
            });
        }

        return { articles, truncated: keys.length >= MAX_BASE_ARTICLES };
    } catch (err) {
        console.error("[devDashboard] failed to scan cached articles:", err);
        return { articles: [], truncated: false };
    }
}

function percentile(sorted, p) {
    if (sorted.length === 0) return null;
    return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))];
}

export function summarizeDurations(events) {
    const sorted = events.map((e) => e.durationMs).sort((a, b) => a - b);
    return {
        p50: percentile(sorted, 0.5),
        p95: percentile(sorted, 0.95),
        max: sorted.at(-1) ?? null,
    };
}

// One row per (calling stage, requested model), busiest first.
export function summarizeBySource(events) {
    const groups = new Map();
    for (const e of events) {
        const key = `${e.source}|${e.requestedModel}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(e);
    }

    return [...groups.values()]
        .map((group) => ({
            source: group[0].source,
            model: group[0].requestedModel,
            calls: group.length,
            ...summarizeDurations(group),
            errors: group.filter((e) => e.outcome !== "ok").length,
            timeouts: group.reduce((n, e) => n + (e.timeouts ?? 0), 0),
            retries: group.reduce((n, e) => n + (e.retries ?? 0), 0),
            fallbacks: group.filter((e) => e.fellBack).length,
            rateLimitWaitMs: group.reduce((n, e) => n + (e.rateLimitWaitMs ?? 0), 0),
        }))
        .sort((a, b) => b.calls - a.calls);
}

// Sums every "<prefix>:<suffix>" counter across days → { suffix: total }.
export function sumCounters(dailyStats, prefix) {
    const totals = {};
    for (const { fields } of dailyStats) {
        for (const [field, value] of Object.entries(fields)) {
            if (!field.startsWith(`${prefix}:`)) continue;
            const suffix = field.slice(prefix.length + 1);
            totals[suffix] = (totals[suffix] ?? 0) + value;
        }
    }
    return totals;
}

// [{ date, model, calls, tokensIn, tokensOut }] for days that had any calls.
export function tokenRows(dailyStats) {
    return dailyStats.flatMap(({ date, fields }) => {
        const models = Object.keys(fields)
            .filter((f) => f.startsWith("calls:"))
            .map((f) => f.slice("calls:".length))
            .sort();
        return models.map((model) => ({
            date,
            model,
            calls: fields[`calls:${model}`] ?? 0,
            tokensIn: fields[`tokens-in:${model}`] ?? 0,
            tokensOut: fields[`tokens-out:${model}`] ?? 0,
        }));
    });
}
