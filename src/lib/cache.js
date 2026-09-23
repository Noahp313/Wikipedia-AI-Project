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

// Edit history across visits lives in its own hash (kept out of the article
// object, which is sent to the chat as currentArticle):
//   "original"   → { article, createdAt }  — the article as first generated
//   <sessionId>  → { startedAt, endedAt, article } — latest state from one page load
// A session's field is overwritten on every change, so it always holds the
// state the user left it in — no need to detect when they navigate away.
// TODO: cap the number of stored sessions before deploy.
function historyKey(articleId) {
    return `user-article-history:${articleId}`;
}

export async function setCachedUserArticle(userId, query, article) {
    const articleId = randomUUID();
    try {
        const stored = { ...article, query, userId };
        await redis
            .pipeline()
            .set(`user-article:${articleId}`, stored, { ex: CACHE_TTL_SECONDS })
            .hset(historyKey(articleId), { original: { article: stored, createdAt: Date.now() } })
            .expire(historyKey(articleId), CACHE_TTL_SECONDS)
            .exec();
        // Generating an article doesn't save it to the user's list — saveUserArticle() does that separately
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

export async function updateCachedUserArticle(articleId, patch) {
    try {
        const existing = await redis.get(`user-article:${articleId}`);
        if (!existing) {
            console.error(`Cannot update article ${articleId}: not found`);
            return null;
        }

        const updated = { ...existing, ...patch };
        await redis.set(`user-article:${articleId}`, updated, { ex: CACHE_TTL_SECONDS });
        return updated;
    } catch (err) {
        console.error(`Error updating cached user article ${articleId}:`, err);
        return null;
    }
}

export async function recordArticleSession(articleId, session, article) {
    try {
        await redis
            .pipeline()
            .hset(historyKey(articleId), {
                [session.id]: { startedAt: session.startedAt, endedAt: Date.now(), article },
            })
            .expire(historyKey(articleId), CACHE_TTL_SECONDS)
            .exec();
    } catch (err) {
        console.error(`Error recording session for article ${articleId}:`, err);
    }
}

// Returns { original, sessions } with sessions newest first. Articles created
// before history existed have no original.
export async function getArticleHistory(articleId) {
    try {
        const all = (await redis.hgetall(historyKey(articleId))) ?? {};
        const { original = null, ...sessionsById } = all;
        const sessions = Object.entries(sessionsById)
            .map(([id, s]) => ({ id, ...s }))
            .sort((a, b) => b.endedAt - a.endedAt);
        return { original, sessions };
    } catch (err) {
        console.error(`Error fetching history for article ${articleId}:`, err);
        return { original: null, sessions: [] };
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

export async function deleteUserArticle(userId, articleId) {
  try {
    await redis.lrem(`user-articles:${userId}`, 0, articleId);
    await redis.del(`user-article:${articleId}`, historyKey(articleId));
    return true;
  } catch (err) {
    console.error(`Error deleting article ${articleId} for ${userId}:`, err);
    return false;
  }
}

export async function saveUserArticle(userId, articleId) {
    try {
        await redis.lpush(`user-articles:${userId}`, articleId);
        return true;
    } catch (err) {
        console.error(`Error saving article ${articleId} for ${userId}:`, err);
        return false;
    }
}

export async function unsaveUserArticle(userId, articleId) {
    try {
        await redis.lrem(`user-articles:${userId}`, 0, articleId);
        return true;
    } catch (err) {
        console.error(`Error unsaving article ${articleId} for ${userId}:`, err);
        return false;
    }
}

export async function isArticleSaved(userId, articleId) {
    try {
        const ids = await redis.lrange(`user-articles:${userId}`, 0, -1);
        return ids.includes(articleId);
    } catch (err) {
        console.error(`Error checking saved status for ${articleId}:`, err);
        return false;
    }
}