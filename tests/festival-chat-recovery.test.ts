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
    disabled: vi.fn(async () => false),
    hvals: vi.fn(async () => [] as unknown[]),
    get: vi.fn(async () => null as string | null),
    multi: vi.fn(() => transaction),
    transaction,
  };
});

vi.mock("@/src/lib/festival-store", () => ({
  getFestivalForChat: mocks.festivalForChat,
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
  mocks.disabled.mockClear();
  mocks.hvals.mockClear();
  mocks.get.mockClear();
  mocks.multi.mockClear();
  mocks.transaction.set.mockClear();
  mocks.transaction.del.mockClear();
  mocks.transaction.exec.mockClear();
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
    expect(mocks.transaction.set).toHaveBeenCalledWith("ginder:chat:-100123:festival", "voodoo-2026-abcd");
    expect(mocks.transaction.del).toHaveBeenCalledWith("ginder:chat:-100123:disabled");
    expect(mocks.transaction.exec).toHaveBeenCalledOnce();
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
