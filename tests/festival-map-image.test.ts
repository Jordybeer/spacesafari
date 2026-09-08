import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  getPersistedFestival: vi.fn(),
  getTelegramFilePath: vi.fn(),
  telegramFileUrl: vi.fn(() => "https://api.telegram.test/file/map.jpg"),
}));

vi.mock("@/src/lib/festival-store", () => ({
  getPersistedFestival: dependencies.getPersistedFestival,
}));

vi.mock("@/src/lib/telegram", () => ({
  getTelegramFilePath: dependencies.getTelegramFilePath,
  telegramFileUrl: dependencies.telegramFileUrl,
}));

import { GET } from "@/app/api/festivals/[festivalId]/map-image/route";

const context = { params: Promise.resolve({ festivalId: "horst-2027-abcd" }) };

beforeEach(() => {
  dependencies.getPersistedFestival.mockReset();
  dependencies.getTelegramFilePath.mockReset();
  dependencies.telegramFileUrl.mockClear();
});

afterEach(() => vi.unstubAllGlobals());

describe("festival map image access", () => {
  it("does not expose the Telegram map file after a festival is archived", async () => {
    dependencies.getPersistedFestival.mockResolvedValue({
      telegramMapFileId: "telegram-file",
      archivedAt: "2027-07-12T12:00:00.000Z",
    });

    const response = await GET(new Request("https://ginder.test/api/festivals/horst-2027-abcd/map-image"), context);

    expect(response.status).toBe(404);
    expect(dependencies.getTelegramFilePath).not.toHaveBeenCalled();
  });

  it("still proxies the image for an active festival", async () => {
    dependencies.getPersistedFestival.mockResolvedValue({
      telegramMapFileId: "telegram-file",
      archivedAt: null,
    });
    dependencies.getTelegramFilePath.mockResolvedValue("photos/map.jpg");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { "content-type": "image/jpeg" },
    })));

    const response = await GET(new Request("https://ginder.test/api/festivals/horst-2027-abcd/map-image"), context);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect((await response.arrayBuffer()).byteLength).toBe(3);
  });
});
