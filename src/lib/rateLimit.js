import { Ratelimit } from "@upstash/ratelimit";
import { redis } from "../lib/redis";

export const flashLiteRateLimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(20, "10 s"),
    analytics: true,
    prefix: "ratelimit:flash-lite",
});

export const generationRateLimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, "10 s"),
    analytics: true,
    prefix: "ratelimit:generation",
});