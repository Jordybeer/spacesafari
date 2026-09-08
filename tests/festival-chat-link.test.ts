import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  hashes: new Map<string, Map<string, unknown>>(),
  strings: new Map<string, unknown>(),
  sets: new Map<string, Set<string>>(),
}));

vi.mock("@/src/lib/storage", () => ({
  getRedis: () => {
    const hset = async (key: string, values: Record<string, unknown>) => {
      const hash = state.hashes.get(key) ?? new Map<string, unknown>();
      for (const [field, value] of Object.entries(values)) hash.set(field, value);
      state.hashes.set(key, hash);
      return Object.keys(values).length;
    };
    const del = async (key: string) => Number([
      state.strings.delete(key),
      state.hashes.delete(key),
      state.sets.delete(key),
    ].some(Boolean));
    const client = {
      get: async (key: string) => state.strings.get(key) ?? null,
      set: async (key: string, value: unknown, options?: { nx?: boolean }) => {
        if (options?.nx && state.strings.has(key)) return null;
        state.strings.set(key, value);
        return "OK";
      },
      del,
      sadd: async (key: string, value: string) => {
        const set = state.sets.get(key) ?? new Set<string>();
        set.add(value);
        state.sets.set(key, set);
        return 1;
      },
      smembers: async (key: string) => [...(state.sets.get(key) ?? [])],
      hget: async (key: string, field: string) => state.hashes.get(key)?.get(field) ?? null,
      hvals: async (key: string) => [...(state.hashes.get(key)?.values() ?? [])],
      hset,
      multi: () => {
        const operations: Array<() => Promise<unknown>> = [];
        const transaction = {
          hset(key: string, values: Record<string, unknown>) {
            operations.push(() => hset(key, values));
            return transaction;
          },
          set(key: string, value: unknown) {
            operations.push(async () => {
              state.strings.set(key, value);
              return "OK";
            });
            return transaction;
          },
          sadd(key: string, value: string) {
            operations.push(async () => {
              const set = state.sets.get(key) ?? new Set<string>();
              set.add(value);
              state.sets.set(key, set);
              return 1;
            });
            return transaction;
          },
          del(key: string) {
            operations.push(() => del(key));
            return transaction;
          },
          async exec() {
            return await Promise.all(operations.map((operation) => operation()));
          },
        };
        return transaction;
      },
    };
    return client;
  },
}));

import {
  FestivalChatAlreadyLinkedError,
  beginFestivalMapUpload,
  clearFestivalMapUpload,
  finalizePendingFestival,
  getCurrentFestivalForOwner,
  getFestivalAwaitingMapUpload,
  getFestivalForChat,
  getFestivalsForOwner,
  getPersistedFestival,
  replacePersistedFestivalMap,
  selectFestivalForOwner,
  type PendingFestivalCreation,
} from "@/src/lib/festival-store";

function pending(ownerTelegramId: number, proposedId: string): PendingFestivalCreation {
  return {
    ownerTelegramId,
    requestId: ownerTelegramId,
    name: proposedId,
    year: 2027,
    proposedId,
    publicKey: `${proposedId}-public`,
    createdAt: "2027-01-01T10:00:00.000Z",
  };
}

beforeEach(() => {
  state.hashes.clear();
  state.strings.clear();
  state.sets.clear();
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

  it("indexes every festival for its owner and allows safe switching", async () => {
    const first = await finalizePendingFestival(pending(42, "horst-2027-a"), { id: -1001 });
    const second = await finalizePendingFestival(pending(42, "dour-2027-b"), { id: -1002 });

    expect(new Set((await getFestivalsForOwner(42)).map((festival) => festival.id)))
      .toEqual(new Set([first.festival.id, second.festival.id]));

    await selectFestivalForOwner(42, first.festival.publicKey);
    expect((await getCurrentFestivalForOwner(42))?.id).toBe(first.festival.id);
    await expect(selectFestivalForOwner(99, first.festival.publicKey)).rejects.toThrow("deze eigenaar");
  });

  it("backfills festivals created before the owner index existed", async () => {
    const first = await finalizePendingFestival(pending(42, "horst-2027-a"), { id: -1001 });
    const second = await finalizePendingFestival(pending(42, "dour-2027-b"), { id: -1002 });
    state.sets.clear();

    expect(new Set((await getFestivalsForOwner(42)).map((festival) => festival.id)))
      .toEqual(new Set([first.festival.id, second.festival.id]));
    expect(state.sets.get("ginder:user:42:festivals"))
      .toEqual(new Set([first.festival.id, second.festival.id]));
  });

  it("arms map replacement for the selected owner and can cancel it", async () => {
    const created = await finalizePendingFestival(pending(42, "horst-2027-a"), { id: -1001 });
    await beginFestivalMapUpload(42, created.festival.id);
    expect((await getFestivalAwaitingMapUpload(42))?.id).toBe(created.festival.id);

    await clearFestivalMapUpload(42);
    expect(await getFestivalAwaitingMapUpload(42)).toBeNull();
  });

  it("replaces a map and atomically invalidates its old anchors", async () => {
    const created = await finalizePendingFestival(pending(42, "horst-2027-a"), { id: -1001 });
    const anchorsKey = `ginder:festival:${created.festival.id}:map:anchors`;
    state.hashes.set(anchorsKey, new Map([["old-anchor", { id: "old-anchor" }]]));

    const updated = await replacePersistedFestivalMap(created.festival.id, {
      mapImageUrl: "https://ginder.test/new-map",
      mapImageWidth: 1200,
      mapImageHeight: 900,
      telegramMapFileId: "new-file",
    });

    expect(updated.status).toBe("anchors");
    expect(state.hashes.has(anchorsKey)).toBe(false);
    expect((await getPersistedFestival(created.festival.id))?.mapImageWidth).toBe(1200);
  });
});
