import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  festivalForChat: vi.fn(async () => ({ id: "space-safari-2026" })),
  disabled: vi.fn(async () => false),
  hvals: vi.fn(async () => [] as unknown[]),
  get: vi.fn(async () => null as string | null),
  set: vi.fn(() => ({ del: vi.fn(() => ({ exec: vi.fn(async () => []) })) })),
}));

const exec = vi.fn(async () => []);
const del = vi.fn(() => ({ exec }));
const set = vi.fn(() => ({ del }));
const multi = vi.fn(() => ({ set, del, exec }));

vi.mock("@/src/lib/festival-store", () => ({
  getFestivalForChat: mocks.festivalForChat,
  isFestivalChatDisabled: mocks.disabled,
}));
vi.mock("@/src/lib/storage", () => ({
  getRedis: () => ({
    hvals: mocks.hvals,
    get: mocks.get,
    multi,
  }),
}));

import { recoverFestivalForChat } from "@/src/lib/festival-chat-recovery";

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockClear();
  multi.mockClear();
  set.mockClear();
  del.mockClear();
  exec.mockClear();
  mocks.disabled.mockResolvedValue(false);
  mocks.festivalForChat.mockResolvedValue({ id: "space-safari-2026" });
  mocks.hvals.mockResolvedValue([]);
  mocks.get.mockResolvedValue(null);
});

describe("festival chat recovery", () => {
  it("returns a healthy existing link unchanged", async () => {
    await expect(recoverFestivalForChat(-1001)).resolves.toEqual({ id: "space-safari-2026" });
    expect(mocks.hvals).not.toHaveBeenCalled();
  });

  it("repairs a stale reverse link from the persisted festival chatId", async () => {
    mocks.festivalForChat.mockRejectedValue(new Error("Festivalkoppeling is ongeldig."));
    mocks.hvals.mockResolvedValue([{
      id: "voodoo-2026-abcd",
      name: "Voodoo Village",
      year: 2026,
      timezone: "Europe/Brussels",
      status: "map",
      mapImageUrl: "",
      mapImageWidth: 640,
      mapImageHeight: 800,
      venueCenter: { latitude: 0, longitude: 0 },
      venueMaxDistanceMeters: 3000,
      chatId: -100123,
      archivedAt: null,
    }]);

    const festival = await recoverFestivalForChat(-100123);

    expect(festival?.id).toBe("voodoo-2026-abcd");
    expect(set).toHaveBeenCalledWith("ginder:chat:-100123:festival", "voodoo-2026-abcd");
    expect(del).toHaveBeenCalledWith("ginder:chat:-100123:disabled");
    expect(exec).toHaveBeenCalledOnce();
  });

  it("marks an unrecoverable stale link disabled instead of repeatedly throwing", async () => {
    mocks.festivalForChat.mockRejectedValue(new Error("Festivalkoppeling is ongeldig."));
    mocks.get.mockResolvedValue("missing-festival");

    await expect(recoverFestivalForChat(-100999)).resolves.toBeNull();
    expect(del).toHaveBeenCalledWith("ginder:chat:-100999:festival");
    expect(set).toHaveBeenCalledWith("ginder:chat:-100999:disabled", "missing-festival");
    expect(exec).toHaveBeenCalledOnce();
  });
});
