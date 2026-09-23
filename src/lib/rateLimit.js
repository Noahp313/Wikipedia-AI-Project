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