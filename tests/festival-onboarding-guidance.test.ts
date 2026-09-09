import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PersistedFestival } from "@/src/lib/festival-store";

const telegram = vi.hoisted(() => ({
  sendMessage: vi.fn(async () => ({})),
}));

vi.mock("@/src/lib/telegram", () => ({
  answerCallbackQuery: vi.fn(async () => undefined),
  createChatInviteLink: vi.fn(async () => ({ invite_link: "https://t.me/+example" })),
  leaveChat: vi.fn(async () => undefined),
  mapMiniAppUrl: vi.fn(() => "https://t.me/ginder?startapp=festival-room"),
  sendMessage: telegram.sendMessage,
}));

import { onboardingMessages } from "@/src/lib/festival-bot-router";

function unfinishedFestival(): PersistedFestival {
  return {
    id: "voodoo-village-2026-EiEu",
    name: "Voodoo Village",
    year: 2026,
    timezone: "Europe/Brussels",
    status: "map",
    mapImageUrl: "",
    mapImageWidth: 640,
    mapImageHeight: 800,
    venueCenter: { latitude: 0, longitude: 0 },
    venueMaxDistanceMeters: 3_000,
    ownerTelegramId: 42,
    publicKey: "EiEu",
    createdAt: "2026-09-08T12:00:00.000Z",
    updatedAt: "2026-09-08T12:00:00.000Z",
    chatId: -1004474370255,
    chatTitle: "Voodoo Village",
    inviteLink: null,
    setupTokenHash: "hash",
    telegramMapFileId: null,
  };
}

beforeEach(() => {
  vi.stubEnv("MAP_ROOM_SECRET", "test-room-secret");
  telegram.sendMessage.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("festival onboarding guidance", () => {
  it("explains the full setup order in the group without sending the owner hunting for commands", async () => {
    await onboardingMessages(unfinishedFestival());

    const copy = telegram.sendMessage.mock.calls.map(([, text]) => text).join("\n");
    expect(copy).toContain("De festivalsetup gebeurt privé bij de maker");
    expect(copy).toContain("1. Festivalkaart sturen");
    expect(copy).toContain("2. Terreinlocatie + grootte");
    expect(copy).toContain("3. 2–6 ankers plaatsen");
    expect(copy).toContain("4. Timetable sturen");
    expect(copy).toContain("Ginder gaat na elke stap automatisch verder");
    expect(copy).toContain("Daarna werken /map en /menu hier in de groep");
    expect(copy).not.toContain("festival-setup");
  });
});
