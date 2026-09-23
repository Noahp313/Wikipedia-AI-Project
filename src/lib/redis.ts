import { Redis } from "@upstash/redis";

// Shared Upstash Redis client — used for article caching, user article lists, and rate limiting.
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});