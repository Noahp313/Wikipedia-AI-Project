import { flashLiteRateLimit, generationRateLimit } from "../lib/rateLimit";

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

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
        await sleep(waitMs);
        return waitForRateLimit(model);
    }
}

async function fetchGemini({ prompt, model, apiVersion = "v1"}) {
    const url = `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
    
    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
        }),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        const err = new Error(`Gemini API error (${response.status}): ${errorBody}`);
        err.status = response.status;
        throw err;
    }

    return response.json();
}

export async function callGemini({ prompt, model = "gemini-3.5-flash", apiVersion = "v1"}, attempt = 0) {
    await waitForRateLimit(model);

    try {
        return await fetchGemini({ prompt, model, apiVersion });
    } catch (err) {
        const isTransient = err.status === 429 || (err.status >= 500 && err.status < 600);

        if (isTransient && attempt < MAX_RETRIES) {
            await sleep(RETRY_DELAY_MS * (attempt + 1));
            return callGemini({ prompt, model, apiVersion }, attempt + 1);
        }

        throw err;
    }
}