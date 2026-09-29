// Anonymous sessions last until the browser closes. The browser that creates
// one gets this marker as a session cookie (no expiry, so the browser drops it
// on close); a later visit that has an anonymous session but no matching
// marker is from a previous browser session, and the root layout ends it.
// Shared by the server (root layout) and the client (auth-client).
export const ANON_MARKER_COOKIE = "wikai-anon-user";
