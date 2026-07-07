import { redis } from "../lib/redis";
import { slugify } from "../lib/slugify";

const CACHE_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

function cacheKey(topic) {
    return `article:${slugify(topic)}`;
}

export async function getCachedArticle(topic) {
    try {
        const cached = await redis.get(cacheKey(topic));
        return cached ?? null;
    } catch (err) {
        console.error(`Error fetching cached article for ${slugify(topic)}:`, err);
        return null;
    }
}

export async function setCachedArticle(topic, article) {
    try {
        await redis.set(cacheKey(topic), article, { ex: CACHE_TTL_SECONDS });
    } catch (err) {
        console.error(`Error setting cached article for ${slugify(topic)}:`, err);
    }
}