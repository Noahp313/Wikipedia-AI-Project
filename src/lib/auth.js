import { betterAuth } from "better-auth";
import { anonymous } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { Pool } from "pg";
import { Redis } from "@upstash/redis";
import { deleteAllUserData, transferUserArticles } from "./cache";

// Better Auth stores JSON strings and parses them itself, so this client must
// not auto-deserialize (unlike the shared one in redis.ts).
const authRedis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
    automaticDeserialization: false,
});

const AUTH_PREFIX = "auth:";

// INCR that sets the TTL only when the key is created (fixed window), atomically.
const INCREMENT_SCRIPT = `
local v = redis.call("INCR", KEYS[1])
if v == 1 then redis.call("EXPIRE", KEYS[1], ARGV[1]) end
return v
`;

// Sessions and rate-limit counters live in Upstash; users and linked accounts
// live in Postgres (Neon). Keeps Neon asleep for most requests.
const upstashSecondaryStorage = {
    get: (key) => authRedis.get(AUTH_PREFIX + key),
    getAndDelete: (key) => authRedis.getdel(AUTH_PREFIX + key),
    increment: async (key, ttl) =>
        Number(await authRedis.eval(INCREMENT_SCRIPT, [AUTH_PREFIX + key], [String(ttl)])),
    set: (key, value, ttl) =>
        ttl ? authRedis.set(AUTH_PREFIX + key, value, { ex: ttl }) : authRedis.set(AUTH_PREFIX + key, value),
    delete: (key) => authRedis.del(AUTH_PREFIX + key),
};

export const auth = betterAuth({
    database: new Pool({ connectionString: process.env.DATABASE_URL }),
    secondaryStorage: upstashSecondaryStorage,
    socialProviders: {
        google: {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        },
    },
    session: {
        // Signed session copy in a cookie, so most requests skip storage entirely.
        cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    user: {
        // Settings → Delete account. Google-only users have no password, so
        // Better Auth requires a session under a day old (freshAge) instead.
        deleteUser: {
            enabled: true,
            beforeDelete: async (user) => {
                await deleteAllUserData(user.id);
            },
        },
    },
    rateLimit: {
        storage: "secondary-storage",
        customRules: {
            // Each anonymous sign-in creates a user row — cap it per IP.
            "/sign-in/anonymous": { window: 60 * 60, max: 10 },
        },
    },
    plugins: [
        // Visitors get an anonymous user the first time they generate an article.
        // Signing in with Google moves their articles over, then Better Auth
        // deletes the anonymous user.
        // TODO: anonymous users who never sign in are never cleaned up.
        anonymous({
            onLinkAccount: async ({ anonymousUser, newUser }) => {
                await transferUserArticles(anonymousUser.user.id, newUser.user.id);
            },
        }),
        nextCookies(), // must stay last
    ],
});
