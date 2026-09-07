import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SPACE_SAFARI_2026 } from "@/src/lib/festivals";

const state = vi.hoisted(() => ({
  hashes: new Map<string, Map<string, unknown>>(),
}));

vi.mock("@/src/lib/storage", () => ({
  getRedis: () => ({
    hget: async (key: string, field: string) => state.hashes.get(key)?.get(field) ?? null,
    hset: async (key: string, values: Record<string, unknown>) => {
      const hash = state.hashes.get(key) ?? new Map<string, unknown>();
      for (const [field, value] of Object.entries(values)) hash.set(field, value);
      state.hashes.set(key, hash);
      return Object.keys(values).length;
    },
  }),
}));

import {
  getPersistedFestival,
  isFestivalOwner,
  issueFestivalSetupToken,
  verifyFestivalSetupToken,
  type PersistedFestival,
} from "@/src/lib/festival-store";

const FESTIVALS_KEY = "ginder:festivals";
const festivalId = "horst-2027-abcd";
const originalToken = "original-setup-token-123456";

function hash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function fixture(): PersistedFestival {
  return {
    id: festivalId,
    name: "Horst",
    year: 2027,
    timezone: "Europe/Brussels",
    status: "anchors",
    mapImageUrl: "https://example.test/map.png",
    mapImageWidth: 1000,
    mapImageHeight: 1200,
    venueCenter: { latitude: 50.8, longitude: 4.3 },
    venueMaxDistanceMeters: 2500,
    ownerTelegramId: 42,
    publicKey: "abcd1234",
    createdAt: "2027-01-01T10:00:00.000Z",
    updatedAt: "2027-01-01T10:00:00.000Z",
    chatId: -100123,
    chatTitle: "Horst crew",
    inviteLink: "https://t.me/+example",
    setupTokenHash: hash(originalToken),
    telegramMapFileId: "file-1",
  };
}

beforeEach(() => {
  state.hashes.clear();
  state.hashes.set(FESTIVALS_KEY, new Map([[festivalId, fixture()]]));
});

describe("festival setup link recovery", () => {
  it("issues a fresh setup link without invalidating the original", async () => {
    expect((await verifyFestivalSetupToken(festivalId, originalToken)).id).toBe(festivalId);

    const { setupToken } = await issueFestivalSetupToken(festivalId);
    expect(setupToken).not.toBe(originalToken);
    expect((await verifyFestivalSetupToken(festivalId, setupToken)).id).toBe(festivalId);
    expect((await verifyFestivalSetupToken(festivalId, originalToken)).id).toBe(festivalId);
  });

  it("stores only hashes for recovery tokens and caps their history", async () => {
    const rawTokens: string[] = [];
    for (let index = 0; index < 7; index += 1) {
      rawTokens.push((await issueFestivalSetupToken(festivalId)).setupToken);
    }

    const stored = await getPersistedFestival(festivalId);
    expect(stored?.setupTokenHashes).toHaveLength(5);
    const serialized = JSON.stringify(stored);
    for (const token of rawTokens) expect(serialized).not.toContain(token);
    expect(serialized).toContain(hash(rawTokens.at(-1)!));
  });

  it("rejects an unrelated token", async () => {
    await expect(verifyFestivalSetupToken(festivalId, "definitely-not-valid-token")).rejects.toThrow("Ongeldige festival setup-link");
  });
});

describe("festival owner map administration", () => {
  it("recognizes only the owner of a persisted custom festival", () => {
    const festival = fixture();
    expect(isFestivalOwner(festival, 42)).toBe(true);
    expect(isFestivalOwner(festival, 43)).toBe(false);
    expect(isFestivalOwner(SPACE_SAFARI_2026, 42)).toBe(false);
  });
});
