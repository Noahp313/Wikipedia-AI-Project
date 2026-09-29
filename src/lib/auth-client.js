import { createAuthClient } from "better-auth/react";
import { anonymousClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
    plugins: [anonymousClient()],
});

// Articles belong to a user, so make sure there is one (anonymous if the
// visitor hasn't signed in) before generating.
export async function ensureSession() {
    const { data } = await authClient.getSession();
    if (data?.user) return data.user;

    const { data: created, error } = await authClient.signIn.anonymous();
    if (error) throw new Error(error.message || "Couldn't start a session");
    return created.user;
}

export function signInWithGoogle(callbackURL = "/") {
    return authClient.signIn.social({ provider: "google", callbackURL });
}
