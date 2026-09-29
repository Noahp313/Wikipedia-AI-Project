"use server";

import { updateCachedUserArticle, recordArticleSession } from "../cache";
import { getOwnedArticle } from "../session";

const MAX_STEPS = 50;
const MAX_STEP_CHARS = 200;

// session: { id, startedAt, steps } for the page load making this change — its
// snapshot is overwritten each time so it ends up holding the final state.
// steps are the labels of this session's edits, shown in My articles.
export async function updateArticleAction(articleId, patch, session) {
    const { article } = await getOwnedArticle(articleId);
    if (!article) {
        throw new Error("Article not found or update failed");
    }

    // Ownership and the original query are server-controlled
    const { userId: _userId, query: _query, ...safePatch } = patch ?? {};
    const updated = await updateCachedUserArticle(articleId, safePatch);
    if (!updated) {
        throw new Error("Article not found or update failed");
    }

    if (typeof session?.id === "string" && session.id.length <= 64 && Number.isFinite(session.startedAt)) {
        const steps = Array.isArray(session.steps)
            ? session.steps
                  .filter((s) => typeof s === "string")
                  .slice(-MAX_STEPS)
                  .map((s) => s.slice(0, MAX_STEP_CHARS))
            : [];
        await recordArticleSession(articleId, session, updated, steps);
    }

    return updated;
}
