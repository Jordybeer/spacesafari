import { Redis } from "@upstash/redis";

let redis: Redis | undefined;

export function isRedisConfigured(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

export function getRedis(): Redis {
  if (!redis) {
    if (!isRedisConfigured()) {
      throw new Error("Live kaart-opslag is nog niet geconfigureerd.");
    }
    redis = Redis.fromEnv();
  }
  return redis;
}
