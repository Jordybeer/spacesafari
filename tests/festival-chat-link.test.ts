import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  hashes: new Map<string, Map<string, unknown>>(),
  strings: new Map<string, unknown>(),
}));

vi.mock("@/src/lib/storage", () => ({
  getRedis: () => ({
    get: async (key: string) => state.strings.get(key) ?? null,
    set: async (key: string, value: unknown, options?: { nx?: boolean }) => {
      if (options?.nx && state.strings.has(key)) return null;
      state.strings.set(key, value);
      return "OK";
    },
    del: async (key: string) => Number(state.strings.delete(key)),
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
  FestivalChatAlreadyLinkedError,
  finalizePendingFestival,
  getFestivalForChat,
  type PendingFestivalCreation,
} from "@/src/lib/festival-store";

function pending(ownerTelegramId: number, proposedId: string): PendingFestivalCreation {
  return {
    ownerTelegramId,
    requestId: ownerTelegramId,
    name: proposedId,
    year: 2027,
    proposedId,
    publicKey: `public-${ownerTelegramId}`,
    createdAt: "2027-01-01T10:00:00.000Z",
  };
}

beforeEach(() => {
  state.hashes.clear();
  state.strings.clear();
});

describe("festival Telegram group isolation", () => {
  it("does not let a second festival silently take over an already linked group", async () => {
    const chat = { id: -100123, title: "Festivalcrew" };
    const first = await finalizePendingFestival(pending(42, "horst-2027-a"), chat);

    await expect(finalizePendingFestival(pending(43, "dour-2027-b"), chat))
      .rejects.toBeInstanceOf(FestivalChatAlreadyLinkedError);

    const linked = await getFestivalForChat(chat.id);
    expect(linked.id).toBe(first.festival.id);
    expect(linked.name).toBe("horst-2027-a");
  });
});
