import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  direct: null as unknown,
  festivals: [] as unknown[],
  writes: [] as Array<[string, unknown]>,
}));

vi.mock("@/src/lib/festival-store", () => ({
  resolveFestivalDefinition: vi.fn(async () => state.direct),
}));

vi.mock("@/src/lib/storage", () => ({
  getRedis: () => ({
    hvals: async () => state.festivals,
    set: async (key: string, value: unknown) => {
      state.writes.push([key, value]);
      return "OK";
    },
  }),
}));

import { resolveMapFestivalDefinition } from "@/src/lib/map-festival-resolver";

function festival(overrides: Record<string, unknown> = {}) {
  return {
    id: "voodoo-village-2026-EiEu",
    name: "Voodoo Village",
    year: 2026,
    timezone: "Europe/Brussels",
    status: "ready",
    mapImageUrl: "/api/festivals/voodoo-village-2026-EiEu/map-image",
    mapImageWidth: 1200,
    mapImageHeight: 900,
    venueCenter: { latitude: 51.0, longitude: 4.0 },
    venueMaxDistanceMeters: 3000,
    ownerTelegramId: 42,
    publicKey: "AbCd1234",
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-01T10:00:00.000Z",
    chatId: -100123,
    chatTitle: "Crew",
    inviteLink: null,
    setupTokenHash: "hash",
    telegramMapFileId: "file",
    ...overrides,
  };
}

beforeEach(() => {
  state.direct = null;
  state.festivals = [];
  state.writes = [];
});

describe("map festival selector recovery", () => {
  it("keeps the normal indexed resolver as the fast path", async () => {
    const direct = festival();
    state.direct = direct;

    expect(await resolveMapFestivalDefinition("AbCd1234")).toBe(direct);
    expect(state.writes).toEqual([]);
  });

  it("recovers a legacy public selector and self-heals its Redis index", async () => {
    const legacy = festival();
    state.festivals = [legacy];

    expect(await resolveMapFestivalDefinition("AbCd1234")).toBe(legacy);
    expect(state.writes).toEqual([
      ["ginder:festival:public:AbCd1234", "voodoo-village-2026-EiEu"],
    ]);
  });

  it("keeps opaque public selectors case-sensitive and ignores archived festivals", async () => {
    state.festivals = [festival(), festival({ publicKey: "Dead1234", archivedAt: "2026-09-10T10:00:00.000Z" })];

    expect(await resolveMapFestivalDefinition("abcd1234")).toBeNull();
    expect(await resolveMapFestivalDefinition("Dead1234")).toBeNull();
    expect(state.writes).toEqual([]);
  });
});
