import { cookies, headers } from "next/headers";
import { auth } from "./auth";
import { getCachedUserArticle } from "./cache";
import { ANON_MARKER_COOKIE } from "./anonSession";

// An anonymous session without this browser session's marker cookie is left
// over from before the browser was closed (see lib/anonSession.js).
export async function isStaleAnonymous(user) {
    if (!user?.isAnonymous) return false;
    return (await cookies()).get(ANON_MARKER_COOKIE)?.value !== user.id;
}

// The signed-in (or anonymous) user for this request, or null. Server-only —
// never trust a userId sent by the client. A stale anonymous session counts
// as no session, so its articles can't be reached after the browser closes.
export async function getSessionUser() {
    const session = await auth.api.getSession({ headers: await headers() });
    const user = session?.user ?? null;
    return (await isStaleAnonymous(user)) ? null : user;
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
