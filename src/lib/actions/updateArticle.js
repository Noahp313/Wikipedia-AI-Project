"use server";

import { updateCachedUserArticle, recordArticleSession } from "../cache";

// session: { id, startedAt } for the page load making this change — its
// snapshot is overwritten each time so it ends up holding the final state.
export async function updateArticleAction(articleId, patch, session) {
    const updated = await updateCachedUserArticle(articleId, patch);
    if (!updated) {
        throw new Error("Article not found or update failed");
    }

    if (typeof session?.id === "string" && session.id.length <= 64 && Number.isFinite(session.startedAt)) {
        await recordArticleSession(articleId, session, updated);
    }

    return updated;
}
