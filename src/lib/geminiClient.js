import { flashLiteRateLimit, generationRateLimit } from "../lib/rateLimit";

const MAX_RETRIES = 4;
const RETRY_DELAY_MS = 2000;

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

async function waitForRateLimit(model) {
    const limiter = limiterForModel(model);
    const { success, reset } = await limiter.limit("gemini-global");

    if (!success) {
        const waitMs = Math.max(reset - Date.now(), 0);
        console.log(`[rateLimit] ${model} blocked, waiting ${waitMs}ms`);
        await sleep(waitMs);
        return waitForRateLimit(model);
    }
}

async function fetchGemini({ prompt, model, apiVersion = "v1" }) {
    const url = `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
    
    const start = Date.now();
    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
        }),
    });
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