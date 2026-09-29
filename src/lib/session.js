import { headers } from "next/headers";
import { auth } from "./auth";
import { getCachedUserArticle } from "./cache";

// The signed-in (or anonymous) user for this request, or null. Server-only —
// never trust a userId sent by the client.
export async function getSessionUser() {
    const session = await auth.api.getSession({ headers: await headers() });
    return session?.user ?? null;
}

// The article if it belongs to the current user, else null. Callers should
// respond as if it doesn't exist, so article ids can't be probed.
export async function getOwnedArticle(articleId) {
    const user = await getSessionUser();
    if (!user || typeof articleId !== "string") return { user, article: null };

    const article = await getCachedUserArticle(articleId);
    if (!article || article.userId !== user.id) return { user, article: null };

    return { user, article };
}
