import { Redis } from "@upstash/redis";

let redis: Redis | undefined;

type RedisCredentials = {
  url: string;
  token: string;
};

export function getRedisCredentials(): RedisCredentials | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url, token } : null;
}

export function isRedisConfigured(): boolean {
  return getRedisCredentials() !== null;
}

export function getRedis(): Redis {
  if (!redis) {
    const credentials = getRedisCredentials();
    if (!credentials) {
      throw new Error("Live kaart-opslag is nog niet geconfigureerd.");
    }
    redis = new Redis(credentials);
  }
  return redis;
}
