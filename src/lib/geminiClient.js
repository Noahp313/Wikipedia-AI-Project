import { flashLiteRateLimit, generationRateLimit } from "../lib/rateLimit";

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

async function fetchGemini({ prompt, model, apiVersion = "v1" }) {
    const url = `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;

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
            }),
            signal: controller.signal,
        });
    } catch (err) {
        const elapsed = Date.now() - start;
        if (err.name === "AbortError") {
            console.log(`[fetchGemini] ${model} TIMED OUT after ${elapsed}ms (limit ${FETCH_TIMEOUT_MS}ms)`);
            const timeoutErr = new Error(`Gemini API timeout after ${FETCH_TIMEOUT_MS}ms`);
            timeoutErr.status = 504; // treated as transient by callGemini's retry/fallback logic
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

    const json = await response.json()
    const usage = json?.usageMetadata;
    const finishReason = json?.candidates?.[0]?.finishReason;
    console.log(`[fetchGemini] ${model} succeeded in ${elapsed}ms, finishReason: ${finishReason}`);
    console.log(`[fetchGemini] usageMetadata:`, JSON.stringify(usage, null, 2));

    return json;
}

export async function callGemini({ prompt, model = "gemini-3.5-flash", apiVersion = "v1" }, attempt = 0) {
    const rateLimitStart = Date.now();
    await waitForRateLimit(model);
    const rateLimitElapsed = Date.now() - rateLimitStart;
    if (rateLimitElapsed > 50) {
        console.log(`[rateLimit] ${model} waited ${rateLimitElapsed}ms total`);
    }

    try {
        return await fetchGemini({ prompt, model, apiVersion });
    } catch (err) {
        const isTransient = err.status === 429 || (err.status >= 500 && err.status < 600);

        if (isTransient && attempt < MAX_RETRIES) {
            console.log(`[callGemini] ${model} retrying, attempt ${attempt + 1}`);
            await sleep(RETRY_DELAY_MS * 2 ** (attempt));
            return callGemini({ prompt, model, apiVersion }, attempt + 1);
        }

        if (isTransient && model === "gemini-3.5-flash") {
            console.warn("Falling back to flash-lite after exhausted retries");
            return callGemini({ prompt, model: "gemini-3.1-flash-lite", apiVersion }, 0);
        }

        throw err;
    }
}