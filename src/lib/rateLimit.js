import { Ratelimit } from "@upstash/ratelimit";
import { redis } from "../lib/redis";

// Higher ceiling for cheap, high-volume calls (topic detection, relevance checks).
export const flashLiteRateLimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(20, "10 s"),
    analytics: false,
    prefix: "ratelimit:flash-lite",
});

// Lower ceiling for the stronger model used in article synthesis.
export const generationRateLimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, "10 s"),
    analytics: false,
    prefix: "ratelimit:generation",
});
// Brute-force guard for the developer dashboard login (global, not per-IP).
export const devLoginRateLimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, "1 m"),
    analytics: false,
    prefix: "ratelimit:dev-login",
});
