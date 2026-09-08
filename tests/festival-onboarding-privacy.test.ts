import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const telegram = vi.hoisted(() => ({
  sendMessage: vi.fn<(
    chatId: string | number,
    text: string,
    options?: Record<string, unknown>,
  ) => Promise<Record<string, never>>>(async () => ({})),
}));

vi.mock("@/src/lib/telegram", () => ({
  answerCallbackQuery: vi.fn(),
  createChatInviteLink: vi.fn(),
  mapMiniAppUrl: vi.fn(() => "https://t.me/ginder?startapp=festival-room"),
  sendMessage: telegram.sendMessage,
}));

import { onboardingMessages } from "@/src/lib/festival-bot-router";
import type { PersistedFestival } from "@/src/lib/festival-store";

function festival(): PersistedFestival {
  return {
    id: "horst-2027-abcd",
    name: "Horst",
    year: 2027,
    timezone: "Europe/Brussels",
    status: "map",
    mapImageUrl: "",
    mapImageWidth: 640,
    mapImageHeight: 800,
    venueCenter: { latitude: 0, longitude: 0 },
    venueMaxDistanceMeters: 3_000,
    ownerTelegramId: 42,
    publicKey: "public42",
    createdAt: "2027-01-01T10:00:00.000Z",
    updatedAt: "2027-01-01T10:00:00.000Z",
    chatId: -100123,
    chatTitle: "Horst crew",
    inviteLink: "https://t.me/+example",
    setupTokenHash: crypto.createHash("sha256").update("owner-secret-token").digest("hex"),
    telegramMapFileId: null,
  };
}

beforeEach(() => {
  vi.stubEnv("MAP_ROOM_SECRET", "test-room-secret");
  telegram.sendMessage.mockClear();
});

afterEach(() => vi.unstubAllEnvs());

describe("festival onboarding privacy", () => {
  it("never posts owner setup access in the festival group", async () => {
    await onboardingMessages(festival());

    expect(telegram.sendMessage).toHaveBeenCalledTimes(3);
    expect(telegram.sendMessage.mock.calls.every(([chatId]) => chatId === -100123)).toBe(true);

    const groupPayload = JSON.stringify(telegram.sendMessage.mock.calls);
    expect(groupPayload).not.toContain("festival-setup");
    expect(groupPayload).not.toContain("Festival instellen");
    expect(groupPayload).toContain("Open kaart");
  });
});
