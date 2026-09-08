import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const redis = vi.hoisted(() => ({
  ttl: vi.fn(async () => 0),
  set: vi.fn(async () => "OK" as string | null),
  del: vi.fn(async () => 1),
}));

vi.mock("@/src/lib/storage", () => ({
  getRedis: () => redis,
}));

import {
  claimCreationSlot,
  getCreationCooldownSeconds,
  isFestivalCreationRateLimitExempt,
} from "@/src/lib/festival-store";

beforeEach(() => {
  vi.unstubAllEnvs();
  redis.ttl.mockClear();
  redis.set.mockClear();
  redis.del.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("festival creation rate limit", () => {
  it("exempts trusted map admins without touching the cooldown key", async () => {
    vi.stubEnv("MAP_ADMIN_TELEGRAM_IDS", "42,1303637520");
    redis.ttl.mockResolvedValue(12345);
    redis.set.mockResolvedValue(null);

    expect(isFestivalCreationRateLimitExempt(1303637520)).toBe(true);
    await expect(getCreationCooldownSeconds(1303637520)).resolves.toBe(0);
    await expect(claimCreationSlot(1303637520)).resolves.toBe(true);
    expect(redis.ttl).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it("also supports an explicit rate-limit bypass list", async () => {
    vi.stubEnv("FESTIVAL_CREATION_RATE_LIMIT_BYPASS_TELEGRAM_IDS", "777");

    expect(isFestivalCreationRateLimitExempt(777)).toBe(true);
    await expect(getCreationCooldownSeconds(777)).resolves.toBe(0);
    await expect(claimCreationSlot(777)).resolves.toBe(true);
  });

  it("keeps the seven-day cooldown for regular users", async () => {
    redis.ttl.mockResolvedValue(3600);
    redis.set.mockResolvedValue("OK");

    expect(isFestivalCreationRateLimitExempt(99)).toBe(false);
    await expect(getCreationCooldownSeconds(99)).resolves.toBe(3600);
    await expect(claimCreationSlot(99)).resolves.toBe(true);
    expect(redis.ttl).toHaveBeenCalledWith("ginder:festival:create-cooldown:99");
    expect(redis.set).toHaveBeenCalledWith(
      "ginder:festival:create-cooldown:99",
      "1",
      expect.objectContaining({ nx: true }),
    );
  });
});
