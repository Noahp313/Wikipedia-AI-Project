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

// Every article a user generated (saved or not), newest first — used to hand
// an anonymous user's articles to their account when they sign in.
function generatedKey(userId) {
    return `user-generated:${userId}`;
}
const GENERATED_LIST_MAX = 50;

// Saved articles have no TTL; unsaved ones expire CACHE_TTL_SECONDS after their
// last change. Writes use keepTtl + `expire ... XX` (only refresh an existing
// TTL) so an edit never re-adds an expiry to a saved article.

export async function setCachedUserArticle(userId, query, article) {
    const articleId = randomUUID();
    try {
        const stored = { ...article, query, userId };
        await redis
            .pipeline()
            .set(`user-article:${articleId}`, stored, { ex: CACHE_TTL_SECONDS })
            .hset(historyKey(articleId), { original: { article: stored, createdAt: Date.now() } })
            .expire(historyKey(articleId), CACHE_TTL_SECONDS)
            .lpush(generatedKey(userId), articleId)
            .ltrim(generatedKey(userId), 0, GENERATED_LIST_MAX - 1)
            .expire(generatedKey(userId), CACHE_TTL_SECONDS)
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
        await redis
            .pipeline()
            .set(`user-article:${articleId}`, updated, { keepTtl: true })
            .expire(`user-article:${articleId}`, CACHE_TTL_SECONDS, "XX")
            .exec();
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
            .expire(historyKey(articleId), CACHE_TTL_SECONDS, "XX")
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

// Callers must check ownership first — this makes the article permanent.
export async function saveUserArticle(userId, articleId) {
    try {
        await redis
            .pipeline()
            .lrem(`user-articles:${userId}`, 0, articleId) // no duplicates if saved twice
            .lpush(`user-articles:${userId}`, articleId)
            .persist(`user-article:${articleId}`)
            .persist(historyKey(articleId))
            .exec();
        return true;
    } catch (err) {
        console.error(`Error saving article ${articleId} for ${userId}:`, err);
        return false;
    }
}

// Callers must check ownership first — this starts the article's expiry.
export async function unsaveUserArticle(userId, articleId) {
    try {
        await redis
            .pipeline()
            .lrem(`user-articles:${userId}`, 0, articleId)
            .expire(`user-article:${articleId}`, CACHE_TTL_SECONDS)
            .expire(historyKey(articleId), CACHE_TTL_SECONDS)
            .exec();
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

// Hands every article an anonymous user generated to the account they just
// signed in with. Anonymous users can't save, so there's no saved list to move.
export async function transferUserArticles(fromUserId, toUserId) {
    try {
        const ids = await redis.lrange(generatedKey(fromUserId), 0, -1);
        if (!ids.length) return;

        const articles = await Promise.all(ids.map((id) => getCachedUserArticle(id)));
        const pipeline = redis.pipeline();
        const moved = [];
        articles.forEach((article, i) => {
            if (!article || article.userId !== fromUserId) return;
            pipeline.set(`user-article:${ids[i]}`, { ...article, userId: toUserId }, { keepTtl: true });
            moved.push(ids[i]);
        });

        // lrange is newest first; push oldest first so the order is kept
        if (moved.length) {
            pipeline
                .lpush(generatedKey(toUserId), ...[...moved].reverse())
                .ltrim(generatedKey(toUserId), 0, GENERATED_LIST_MAX - 1)
                .expire(generatedKey(toUserId), CACHE_TTL_SECONDS);
        }
        pipeline.del(generatedKey(fromUserId));
        await pipeline.exec();
    } catch (err) {
        console.error(`Error transferring articles from ${fromUserId} to ${toUserId}:`, err);
    }
}
