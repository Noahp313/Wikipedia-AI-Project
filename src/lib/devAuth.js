import { cookies } from "next/headers";
import { createHash, timingSafeEqual } from "crypto";

// Server-side gate for the developer dashboard. The dashboard is disabled
// entirely (every /dev route 404s) unless DEV_DASHBOARD_TOKEN is set to a
// long random value — generate one with: openssl rand -hex 32
export const DEV_SESSION_COOKIE = "dev_session";
export const DEV_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days
const MIN_TOKEN_LENGTH = 32;

function configuredToken() {
    const token = process.env.DEV_DASHBOARD_TOKEN;
    if (!token) return null;
    if (token.length < MIN_TOKEN_LENGTH) {
        console.warn(`[devAuth] DEV_DASHBOARD_TOKEN is shorter than ${MIN_TOKEN_LENGTH} chars — dashboard disabled`);
        return null;
    }
    return token;
}

function sha256(value) {
    return createHash("sha256").update(value).digest();
}

export function isDevDashboardEnabled() {
    return configuredToken() !== null;
}

// Constant-time comparison; hashing first makes both sides equal length.
export function tokenMatches(candidate) {
    const token = configuredToken();
    if (!token || typeof candidate !== "string") return false;
    return timingSafeEqual(sha256(candidate), sha256(token));
}

// The cookie stores a value derived from the token, never the token itself.
// Rotating DEV_DASHBOARD_TOKEN invalidates every existing session.
export function devSessionValue() {
    return sha256(`dev-session:${configuredToken()}`).toString("hex");
}

export async function isDevAuthorized() {
    if (!isDevDashboardEnabled()) return false;

    const cookieStore = await cookies();
    const value = cookieStore.get(DEV_SESSION_COOKIE)?.value;
    if (!value) return false;

    return timingSafeEqual(sha256(value), sha256(devSessionValue()));
}
