import { flashLiteRateLimit, generationRateLimit } from "../lib/rateLimit";
import { recordGeminiCall } from "../lib/devTelemetry";

const MAX_RETRIES = 4;
const RETRY_DELAY_MS = 2000;
const FETCH_TIMEOUT_MS = 30_000;        // give up on a single Gemini call after 30s
const MAX_RATE_LIMIT_WAIT_MS = 30_000;  // never wait more than 30s cumulative for the limiter

// Maps each model to the rate limiter that governs it (see rateLimit.js).
const MODEL_TIERS = {
    "gemini-3.1-flash-lite": "flash-lite",
    "gemini-3.5-flash": "generation",
};

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function limiterForModel(model) {
    const tier = MODEL_TIERS[model] ?? "generation";
    return tier === "flash-lite" ? flashLiteRateLimit : generationRateLimit;
}

async function waitForRateLimit(model, totalWaitedMs = 0) {
    const limiter = limiterForModel(model);
    const { success, reset } = await limiter.limit("gemini-global");

    if (!success) {
        const waitMs = Math.max(reset - Date.now(), 0);

        if (totalWaitedMs + waitMs > MAX_RATE_LIMIT_WAIT_MS) {
            console.log(`[rateLimit] ${model} exceeded wait cap (${totalWaitedMs + waitMs}ms > ${MAX_RATE_LIMIT_WAIT_MS}ms), giving up`);
            const err = new Error(`Rate limit wait exceeded ${MAX_RATE_LIMIT_WAIT_MS}ms cap for ${model}`);
            err.code = "RATE_LIMIT_WAIT_EXCEEDED";
            throw err;
        }

        console.log(`[rateLimit] ${model} blocked, waiting ${waitMs}ms (total so far: ${totalWaitedMs}ms)`);
        await sleep(waitMs);
        return waitForRateLimit(model, totalWaitedMs + waitMs);
    }
}

async function fetchGemini({ prompt, model, apiVersion = "v1", json = false, temperature }) {
    const url = `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;

    const generationConfig = {
        ...(json && { responseMimeType: "application/json" }),
        ...(temperature !== undefined && { temperature }),
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const start = Date.now();
    let response;
    try {
        response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                ...(Object.keys(generationConfig).length > 0 && { generationConfig }),
            }),
            signal: controller.signal,
        });
    } catch (err) {
        const elapsed = Date.now() - start;
        if (err.name === "AbortError") {
            console.log(`[fetchGemini] ${model} TIMED OUT after ${elapsed}ms (limit ${FETCH_TIMEOUT_MS}ms)`);
            const timeoutErr = new Error(`Gemini API timeout after ${FETCH_TIMEOUT_MS}ms`);
            timeoutErr.status = 504; // treated as transient by callGemini's retry/fallback logic
            timeoutErr.code = "TIMEOUT";
            throw timeoutErr;
        }
        throw err;
    } finally {
        clearTimeout(timeoutId);
    }

    const elapsed = Date.now() - start;

    if (!response.ok) {
        const errorBody = await response.text();
        console.log(`[fetchGemini] ${model} FAILED after ${elapsed}ms (status ${response.status}): ${errorBody.slice(0, 200)}`);
        const err = new Error(`Gemini API error (${response.status}): ${errorBody}`);
        err.status = response.status;
        throw err;
    }

    const result = await response.json()
    const usage = result?.usageMetadata;
    const finishReason = result?.candidates?.[0]?.finishReason;
    console.log(`[fetchGemini] ${model} succeeded in ${elapsed}ms, finishReason: ${finishReason}`);
    console.log(`[fetchGemini] usageMetadata:`, JSON.stringify(usage, null, 2));

    return result;
}

const DEFAULT_MODEL = "gemini-3.5-flash";
const FALLBACK_MODEL = "gemini-3.1-flash-lite";

// `source` names the calling stage (e.g. "create-user-article") for the dev dashboard.
export async function callGemini({ source = "unknown", ...options }) {
    const requestedModel = options.model ?? DEFAULT_MODEL;
    // Filled in by callGeminiWithRetry across all attempts and any fallback.
    const stats = { model: requestedModel, retries: 0, timeouts: 0, rateLimitWaitMs: 0, fellBack: false };
    const start = Date.now();
    let result;
    let error;

    try {
        result = await callGeminiWithRetry({ ...options, model: requestedModel }, 0, stats);
        return result;
    } catch (err) {
        error = err;
        throw err;
    } finally {
        const usage = result?.usageMetadata;
        recordGeminiCall({
            timestamp: start,
            source,
            requestedModel,
            model: stats.model,
            durationMs: Date.now() - start,
            rateLimitWaitMs: stats.rateLimitWaitMs,
            retries: stats.retries,
            timeouts: stats.timeouts,
            fellBack: stats.fellBack,
            inputTokens: usage?.promptTokenCount ?? 0,
            // Thinking tokens are billed as output
            outputTokens: (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0),
            outcome: !error
                ? "ok"
                : error.code === "RATE_LIMIT_WAIT_EXCEEDED"
                ? "rate-limited"
                : error.code === "TIMEOUT"
                ? "timeout"
                : "error",
            status: error?.status ?? null,
        });
    }
}

async function callGeminiWithRetry({ prompt, model, apiVersion = "v1", json = false, temperature }, attempt, stats) {
    stats.model = model;
    const rateLimitStart = Date.now();
    await waitForRateLimit(model);
    const rateLimitElapsed = Date.now() - rateLimitStart;
    stats.rateLimitWaitMs += rateLimitElapsed;
    if (rateLimitElapsed > 50) {
        console.log(`[rateLimit] ${model} waited ${rateLimitElapsed}ms total`);
    }

    try {
        return await fetchGemini({ prompt, model, apiVersion, json, temperature });
    } catch (err) {
        const isTransient = err.status === 429 || (err.status >= 500 && err.status < 600);
        if (err.code === "TIMEOUT") stats.timeouts++;

        if (isTransient && attempt < MAX_RETRIES) {
            console.log(`[callGemini] ${model} retrying, attempt ${attempt + 1}`);
            stats.retries++;
            await sleep(RETRY_DELAY_MS * 2 ** (attempt));
            return callGeminiWithRetry({ prompt, model, apiVersion, json, temperature }, attempt + 1, stats);
        }

        if (isTransient && model === DEFAULT_MODEL) {
            console.warn("Falling back to flash-lite after exhausted retries");
            stats.fellBack = true;
            return callGeminiWithRetry({ prompt, model: FALLBACK_MODEL, apiVersion, json, temperature }, 0, stats);
        }

        throw err;
    }
}

// ---------------------------------------------------------------------------
// Streaming. Same rate limiting, retries/fallback and telemetry as callGemini,
// with two differences: retries only happen before the first chunk (text the
// reader has already seen can't be silently replaced), and the timeout is an
// idle timeout between chunks, since a long answer can legitimately take more
// than FETCH_TIMEOUT_MS overall.

async function openGeminiStream({ prompt, model, apiVersion = "v1", json = false, temperature }) {
    const url = `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:streamGenerateContent?alt=sse&key=${process.env.GEMINI_API_KEY}`;

    const generationConfig = {
        ...(json && { responseMimeType: "application/json" }),
        ...(temperature !== undefined && { temperature }),
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let response;
    try {
        response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                ...(Object.keys(generationConfig).length > 0 && { generationConfig }),
            }),
            signal: controller.signal,
        });
    } catch (err) {
        if (err.name === "AbortError") {
            const timeoutErr = new Error(`Gemini API timeout after ${FETCH_TIMEOUT_MS}ms`);
            timeoutErr.status = 504;
            timeoutErr.code = "TIMEOUT";
            throw timeoutErr;
        }
        throw err;
    } finally {
        clearTimeout(timeoutId);
    }

    if (!response.ok) {
        const errorBody = await response.text();
        console.log(`[streamGemini] ${model} FAILED (status ${response.status}): ${errorBody.slice(0, 200)}`);
        const err = new Error(`Gemini API error (${response.status}): ${errorBody}`);
        err.status = response.status;
        throw err;
    }

    return { response, controller };
}

async function openGeminiStreamWithRetry(options, attempt, stats) {
    const { model } = options;
    stats.model = model;
    const rateLimitStart = Date.now();
    await waitForRateLimit(model);
    stats.rateLimitWaitMs += Date.now() - rateLimitStart;

    try {
        return await openGeminiStream(options);
    } catch (err) {
        const isTransient = err.status === 429 || (err.status >= 500 && err.status < 600);
        if (err.code === "TIMEOUT") stats.timeouts++;

        if (isTransient && attempt < MAX_RETRIES) {
            console.log(`[streamGemini] ${model} retrying, attempt ${attempt + 1}`);
            stats.retries++;
            await sleep(RETRY_DELAY_MS * 2 ** attempt);
            return openGeminiStreamWithRetry(options, attempt + 1, stats);
        }

        if (isTransient && model === DEFAULT_MODEL) {
            console.warn("[streamGemini] Falling back to flash-lite after exhausted retries");
            stats.fellBack = true;
            return openGeminiStreamWithRetry({ ...options, model: FALLBACK_MODEL }, 0, stats);
        }

        throw err;
    }
}

// Yields the response text as it arrives (thought parts excluded).
export async function* streamGemini({ source = "unknown", ...options }) {
    const requestedModel = options.model ?? DEFAULT_MODEL;
    const stats = { model: requestedModel, retries: 0, timeouts: 0, rateLimitWaitMs: 0, fellBack: false };
    const start = Date.now();
    let usage;
    let error;

    try {
        const { response, controller } = await openGeminiStreamWithRetry(
            { ...options, model: requestedModel },
            0,
            stats
        );
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
            const idle = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
            let chunk;
            try {
                chunk = await reader.read();
            } catch (err) {
                if (err.name === "AbortError") {
                    stats.timeouts++;
                    const timeoutErr = new Error(`Gemini stream stalled for ${FETCH_TIMEOUT_MS}ms`);
                    timeoutErr.status = 504;
                    timeoutErr.code = "TIMEOUT";
                    throw timeoutErr;
                }
                throw err;
            } finally {
                clearTimeout(idle);
            }
            if (chunk.done) break;

            buffer += decoder.decode(chunk.value, { stream: true }).replace(/\r\n/g, "\n");
            let boundary;
            while ((boundary = buffer.indexOf("\n\n")) !== -1) {
                const event = buffer.slice(0, boundary);
                buffer = buffer.slice(boundary + 2);
                const data = event
                    .split("\n")
                    .filter((line) => line.startsWith("data:"))
                    .map((line) => line.slice(5).trim())
                    .join("");
                if (!data) continue;

                const parsed = JSON.parse(data);
                usage = parsed.usageMetadata ?? usage;
                const text = (parsed.candidates?.[0]?.content?.parts ?? [])
                    .filter((part) => !part.thought && typeof part.text === "string")
                    .map((part) => part.text)
                    .join("");
                if (text) yield text;
            }
        }

        console.log(`[streamGemini] ${stats.model} finished in ${Date.now() - start}ms`);
    } catch (err) {
        error = err;
        throw err;
    } finally {
        recordGeminiCall({
            timestamp: start,
            source,
            requestedModel,
            model: stats.model,
            durationMs: Date.now() - start,
            rateLimitWaitMs: stats.rateLimitWaitMs,
            retries: stats.retries,
            timeouts: stats.timeouts,
            fellBack: stats.fellBack,
            inputTokens: usage?.promptTokenCount ?? 0,
            outputTokens: (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0),
            outcome: !error
                ? "ok"
                : error.code === "RATE_LIMIT_WAIT_EXCEEDED"
                ? "rate-limited"
                : error.code === "TIMEOUT"
                ? "timeout"
                : "error",
            status: error?.status ?? null,
        });
    }
}
