import { createAuthClient } from "better-auth/react";
import { anonymousClient } from "better-auth/client/plugins";
import { ANON_MARKER_COOKIE } from "./anonSession";

export const authClient = createAuthClient({
    plugins: [anonymousClient()],
});

function writeMarker(value, extra = "") {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${ANON_MARKER_COOKIE}=${value}; Path=/; SameSite=Lax${secure}${extra}`;
}

export function isThisBrowsersAnonymousUser(userId) {
    return document.cookie.split("; ").includes(`${ANON_MARKER_COOKIE}=${userId}`);
}

// Deletes the anonymous user (their unsaved articles then expire on their own)
// and clears the session cookies. signOut runs even if the delete fails, e.g.
// when the session is too old for Better Auth's fresh-session check.
export async function endAnonymousSession() {
    await authClient.deleteAnonymousUser().catch(() => {});
    await authClient.signOut().catch(() => {});
    writeMarker("", "; Max-Age=0");
}

// Articles belong to a user, so make sure there is one (anonymous if the
// visitor hasn't signed in) before generating.
export async function ensureSession() {
    const { data } = await authClient.getSession();
    const user = data?.user;
    if (user && (!user.isAnonymous || isThisBrowsersAnonymousUser(user.id))) return user;
    if (user) await endAnonymousSession(); // left over from a previous browser session

    const { data: created, error } = await authClient.signIn.anonymous();
    if (error) throw new Error(error.message || "Couldn't start a session");
    // Session cookie (no expiry): gone when the browser closes — see lib/anonSession.js
    writeMarker(created.user.id);
    return created.user;
}

export function signInWithGoogle(callbackURL = "/") {
    return authClient.signIn.social({ provider: "google", callbackURL });
}
