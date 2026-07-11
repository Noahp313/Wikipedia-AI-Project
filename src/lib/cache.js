import { redis } from "../lib/redis";
import { slugify } from "../lib/slugify";
import { randomUUID } from "crypto";

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

export async function setCachedUserArticle(userId, query, article) {
    const articleId = randomUUID();
    try {
        await redis.set(`user-article:${articleId}`, { ...article, query, userId }, { ex: CACHE_TTL_SECONDS });
        await redis.lpush(`user-articles:${userId}`, articleId);
        return articleId;
    } catch (err) {
        console.error(`Error setting cached user article for ${userId}:`, err);
        return null;
    }
}

export async function getCachedUserArticle(articleId) {
    try {
        const cached = await redis.get(`user-article:${articleId}`);
        return cached ?? null;
    } catch (err) {
        console.error(`Error fetching cached user article ${articleId}:`, err);
        return null;
    }
}

export async function getUserArticleIds(userId) {
    try {
        return await redis.lrange(`user-articles:${userId}`, 0, -1);
    } catch (err) {
        console.error(`Error fetching article list for ${userId}:`, err);
        return [];
    }
}