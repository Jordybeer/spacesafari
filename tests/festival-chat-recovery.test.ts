import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const transaction: {
    set: ReturnType<typeof vi.fn>;
    del: ReturnType<typeof vi.fn>;
    exec: ReturnType<typeof vi.fn>;
  } = {} as never;
  transaction.set = vi.fn(() => transaction);
  transaction.del = vi.fn(() => transaction);
  transaction.exec = vi.fn(async () => []);
  return {
    festivalForChat: vi.fn(async () => ({ id: "space-safari-2026" })),
    persistedFestival: vi.fn(async () => null as null | {
      id: string;
      chatId: number | null;
      archivedAt?: string | null;
    }),
    disabled: vi.fn(async () => false),
    hvals: vi.fn(async () => [] as unknown[]),
    get: vi.fn(async () => null as string | null),
    multi: vi.fn(() => transaction),
    transaction,
  };
});

vi.mock("@/src/lib/festival-store", () => ({
  getFestivalForChat: mocks.festivalForChat,
  getPersistedFestival: mocks.persistedFestival,
  isFestivalChatDisabled: mocks.disabled,
}));
vi.mock("@/src/lib/storage", () => ({
  getRedis: () => ({
    hvals: mocks.hvals,
    get: mocks.get,
    multi: mocks.multi,
  }),
}));

import { recoverFestivalForChat } from "@/src/lib/festival-chat-recovery";

beforeEach(() => {
  mocks.festivalForChat.mockClear();
  mocks.persistedFestival.mockClear();
  mocks.disabled.mockClear();
  mocks.hvals.mockClear();
  mocks.get.mockClear();
  mocks.multi.mockClear();
  mocks.transaction.set.mockClear();
  mocks.transaction.del.mockClear();
  mocks.transaction.exec.mockClear();
  mocks.disabled.mockResolvedValue(false);
  mocks.festivalForChat.mockResolvedValue({ id: "space-safari-2026" });
  mocks.persistedFestival.mockResolvedValue(null);
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
    expect(mocks.transaction.set).toHaveBeenCalledWith("ginder:chat:-100123:festival", "voodoo-2026-abcd");
    expect(mocks.transaction.del).toHaveBeenCalledWith("ginder:chat:-100123:disabled");
    expect(mocks.transaction.exec).toHaveBeenCalledOnce();
  });

  it("revives a disabled link only when the persisted festival still owns that exact chat", async () => {
    mocks.disabled.mockResolvedValue(true);
    mocks.get.mockResolvedValue("voodoo-village-2026-EiEu");
    mocks.persistedFestival.mockResolvedValue({
      id: "voodoo-village-2026-EiEu",
      chatId: -1004474370255,
      archivedAt: null,
    });

    const festival = await recoverFestivalForChat(-1004474370255);

    expect(mocks.persistedFestival).toHaveBeenCalledWith("voodoo-village-2026-EiEu");
    expect(festival?.id).toBe("voodoo-village-2026-EiEu");
    expect(mocks.transaction.set).toHaveBeenCalledWith(
      "ginder:chat:-1004474370255:festival",
      "voodoo-village-2026-EiEu",
    );
    expect(mocks.transaction.del).toHaveBeenCalledWith("ginder:chat:-1004474370255:disabled");
  });

  it("does not revive an intentionally unlinked or archived festival", async () => {
    mocks.disabled.mockResolvedValue(true);
    mocks.get.mockResolvedValue("voodoo-village-2026-EiEu");
    mocks.persistedFestival.mockResolvedValue({
      id: "voodoo-village-2026-EiEu",
      chatId: null,
      archivedAt: null,
    });

    await expect(recoverFestivalForChat(-1004474370255)).resolves.toBeNull();
    expect(mocks.transaction.set).not.toHaveBeenCalled();
  });

  it("marks an unrecoverable stale link disabled instead of repeatedly throwing", async () => {
    mocks.festivalForChat.mockRejectedValue(new Error("Festivalkoppeling is ongeldig."));
    mocks.get.mockResolvedValue("missing-festival");

    await expect(recoverFestivalForChat(-100999)).resolves.toBeNull();
    expect(mocks.transaction.del).toHaveBeenCalledWith("ginder:chat:-100999:festival");
    expect(mocks.transaction.set).toHaveBeenCalledWith("ginder:chat:-100999:disabled", "missing-festival");
    expect(mocks.transaction.exec).toHaveBeenCalledOnce();
  });
});
