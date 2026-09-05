import { Redis } from "@upstash/redis";

let redis: Redis | undefined;

export function getRedis(): Redis {
  if (!redis) {
    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
      throw new Error("Upstash Redis environment variables are not configured");
    }
    redis = Redis.fromEnv();
  }
  return redis;
}
