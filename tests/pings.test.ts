import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  sets: new Map<string, Set<string>>(),
  published: [] as unknown[],
}));

vi.mock("@/src/lib/storage", () => ({
  getRedis: () => ({
    get: async (key: string) => state.kv.get(key) ?? null,
    set: async (key: string, value: unknown) => { state.kv.set(key, value); return "OK"; },
    del: async (key: string) => state.kv.delete(key) ? 1 : 0,
    sadd: async (key: string, value: string) => {
      const set = state.sets.get(key) ?? new Set<string>();
      set.add(value); state.sets.set(key, set); return 1;
    },
    srem: async (key: string, ...values: string[]) => {
      const set = state.sets.get(key); if (!set) return 0;
      let n = 0; for (const value of values) if (set.delete(value)) n++;
      return n;
    },
    smembers: async (key: string) => [...(state.sets.get(key) ?? new Set<string>())],
    expire: async () => 1,
  }),
}));

vi.mock("@upstash/qstash", () => ({
  Client: class {
    async publishJSON(payload: unknown) { state.published.push(payload); return { messageId: "msg-1" }; }
  },
}));

import { createPing, deletePing, listPings, markPingSent } from "@/src/lib/pings";
import { performerSets } from "@/src/data/timetable";

describe("artist pings", () => {
  beforeEach(() => {
    state.kv.clear(); state.sets.clear(); state.published.length = 0;
    process.env.QSTASH_TOKEN = "test";
    process.env.APP_URL = "https://festival.example";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-05T10:00:00Z"));
  });

  afterEach(() => vi.useRealTimers());

  it("creates one durable ping and recognizes a duplicate", async () => {
    const set = performerSets.find((item) => item.artist === "Sevenum Six")!;
    const first = await createPing("42", set);
    const second = await createPing("42", set);
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(state.published).toHaveLength(1);
    expect(await listPings("42")).toHaveLength(1);
  });

  it("deletes a ping", async () => {
    const set = performerSets.find((item) => item.artist === "Sevenum Six")!;
    await createPing("42", set);
    expect(await deletePing("42", set.id)).toBe(true);
    expect(await listPings("42")).toHaveLength(0);
  });

  it("removes sent pings from the active index", async () => {
    const set = performerSets.find((item) => item.artist === "Sevenum Six")!;
    const { ping } = await createPing("42", set);
    await markPingSent(ping);
    expect(await listPings("42")).toHaveLength(0);
  });
});
