import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const telegram = vi.hoisted(() => ({
  answerCallbackQuery: vi.fn<(
    callbackQueryId: string,
    text?: string,
  ) => Promise<void>>(async () => undefined),
  leaveChat: vi.fn<(chatId: string | number) => Promise<void>>(async () => undefined),
  sendMessage: vi.fn<(
    chatId: string | number,
    text: string,
    options?: Record<string, unknown>,
  ) => Promise<Record<string, never>>>(async () => ({})),
}));

vi.mock("@/src/lib/telegram", () => ({
  answerCallbackQuery: telegram.answerCallbackQuery,
  createChatInviteLink: vi.fn(),
  leaveChat: telegram.leaveChat,
  mapMiniAppUrl: vi.fn(() => "https://t.me/ginder?startapp=festival-room"),
  sendMessage: telegram.sendMessage,
}));

import { onboardingMessages, routeFestivalLifecycleUpdate } from "@/src/lib/festival-bot-router";
import * as festivalStore from "@/src/lib/festival-store";
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
  telegram.answerCallbackQuery.mockClear();
  telegram.leaveChat.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

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

  it("keeps every /festival subcommand out of Telegram groups", async () => {
    await routeFestivalLifecycleUpdate({
      update_id: 1,
      message: {
        message_id: 2,
        from: { id: 42, first_name: "Jordy" },
        chat: { id: -100123, type: "group", title: "Festivalcrew" },
        text: "/festival cancel",
      },
    });

    expect(telegram.sendMessage).toHaveBeenCalledOnce();
    expect(telegram.sendMessage.mock.calls[0][1]).toContain("in privé met Ginder");
  });

  it("clears conflicting setup intents before accepting a replacement map", async () => {
    vi.spyOn(festivalStore, "getCurrentFestivalForOwner").mockResolvedValue(festival());
    const clearPending = vi.spyOn(festivalStore, "clearPendingFestival").mockResolvedValue(undefined);
    const clearName = vi.spyOn(festivalStore, "clearFestivalNamePrompt").mockResolvedValue(undefined);
    const clearGroup = vi.spyOn(festivalStore, "clearFestivalGroupLink").mockResolvedValue(undefined);
    const beginMap = vi.spyOn(festivalStore, "beginFestivalMapUpload").mockResolvedValue(festival());

    await routeFestivalLifecycleUpdate({
      update_id: 2,
      message: {
        message_id: 3,
        from: { id: 42, first_name: "Jordy" },
        chat: { id: 42, type: "private" },
        text: "/festival kaart",
      },
    });

    expect(clearPending).toHaveBeenCalledWith(42);
    expect(clearName).toHaveBeenCalledWith(42);
    expect(clearGroup).toHaveBeenCalledWith(42);
    expect(beginMap).toHaveBeenCalledWith(42, "horst-2027-abcd");
  });

  it("answers a committed owner callback only once when its follow-up message fails", async () => {
    vi.spyOn(festivalStore, "archiveFestivalForOwner").mockResolvedValue({
      festival: { ...festival(), chatId: null, archivedAt: "2027-07-12T12:00:00.000Z" },
      previousChatId: null,
    });
    telegram.sendMessage.mockRejectedValueOnce(new Error("Telegram unavailable"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(await routeFestivalLifecycleUpdate({
      update_id: 3,
      callback_query: {
        id: "archive-callback",
        data: "foarchiveyes:public42",
        from: { id: 42, first_name: "Jordy" },
        message: {
          message_id: 4,
          chat: { id: 42, type: "private" },
        },
      },
    })).toBe(true);

    expect(telegram.answerCallbackQuery).toHaveBeenCalledOnce();
    expect(telegram.answerCallbackQuery).toHaveBeenCalledWith("archive-callback", "Festival gearchiveerd.");
  });

  it("keeps the original group-link request active when the chosen group is occupied", async () => {
    vi.spyOn(festivalStore, "getPendingFestival").mockResolvedValue(null);
    vi.spyOn(festivalStore, "finishFestivalGroupLink")
      .mockRejectedValue(new festivalStore.FestivalChatAlreadyLinkedError());

    await routeFestivalLifecycleUpdate({
      update_id: 4,
      message: {
        message_id: 5,
        from: { id: 42, first_name: "Jordy" },
        chat: { id: 42, type: "private" },
        chat_shared: { request_id: 73, chat_id: -1002, title: "Verkeerde groep" },
      },
    });

    expect(telegram.sendMessage).toHaveBeenCalledOnce();
    expect(telegram.sendMessage.mock.calls[0][2]?.reply_markup).toMatchObject({
      keyboard: [[{ request_chat: { request_id: 73 } }]],
    });
  });
});
