"use server";

import { updateCachedUserArticle } from "../cache";

export async function updateArticleAction(articleId, patch) {
    const updated = await updateCachedUserArticle(articleId, patch);
    if (!updated) {
        throw new Error("Article not found or update failed");
    }
    return updated;
}