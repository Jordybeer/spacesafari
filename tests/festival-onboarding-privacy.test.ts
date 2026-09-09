import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const telegram = vi.hoisted(() => ({
  answerCallbackQuery: vi.fn<(
    callbackQueryId: string,
    text?: string,
  ) => Promise<void>>(async () => undefined),
  createChatInviteLink: vi.fn(async () => ({ invite_link: "https://t.me/+example" })),
  getTelegramFilePath: vi.fn(async () => "files/example"),
  leaveChat: vi.fn<(chatId: string | number) => Promise<void>>(async () => undefined),
  sendMessage: vi.fn<(
    chatId: string | number,
    text: string,
    options?: Record<string, unknown>,
  ) => Promise<Record<string, never>>>(async () => ({})),
}));

vi.mock("@/src/lib/telegram", () => ({
  answerCallbackQuery: telegram.answerCallbackQuery,
  createChatInviteLink: telegram.createChatInviteLink,
  getTelegramFilePath: telegram.getTelegramFilePath,
  leaveChat: telegram.leaveChat,
  mapMiniAppUrl: vi.fn(() => "https://t.me/ginder?startapp=festival-room"),
  sendMessage: telegram.sendMessage,
  telegramFileUrl: vi.fn(() => "https://example.test/file"),
}));

import { routeFestivalBotSetupUpdate } from "@/src/lib/festival-bot-setup-router";
import { onboardingMessages, routeFestivalLifecycleUpdate } from "@/src/lib/festival-bot-router";
import * as festivalStore from "@/src/lib/festival-store";
import type { PendingFestivalCreation, PersistedFestival } from "@/src/lib/festival-store";

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

function pendingFestival(): PendingFestivalCreation {
  return {
    ownerTelegramId: 42,
    requestId: 73,
    name: "Horst",
    year: 2027,
    proposedId: "horst-2027-abcd",
    publicKey: "public42",
    createdAt: "2027-01-01T10:00:00.000Z",
  };
}

beforeEach(() => {
  vi.stubEnv("MAP_ROOM_SECRET", "test-room-secret");
  vi.stubEnv("APP_URL", "https://ginder.example");
  telegram.sendMessage.mockClear();
  telegram.answerCallbackQuery.mockClear();
  telegram.createChatInviteLink.mockClear();
  telegram.getTelegramFilePath.mockClear();
  telegram.leaveChat.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("festival onboarding privacy", () => {
  it("keeps unfinished setup private and does not offer a dead map button in the group", async () => {
    await onboardingMessages(festival());

    expect(telegram.sendMessage).toHaveBeenCalledTimes(3);
    expect(telegram.sendMessage.mock.calls.every(([chatId]) => chatId === -100123)).toBe(true);

    const groupPayload = JSON.stringify(telegram.sendMessage.mock.calls);
    expect(groupPayload).not.toContain("festival-setup");
    expect(groupPayload).not.toContain("Festival instellen");
    expect(groupPayload).not.toContain("Open kaart");
    expect(groupPayload).toContain("festivalsetup gebeurt privé bij de maker");
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

  it("keeps owner setup in Telegram instead of opening the browser form", async () => {
    vi.spyOn(festivalStore, "getCurrentFestivalForOwner").mockResolvedValue(festival());
    vi.spyOn(festivalStore, "getCreationCooldownSeconds").mockResolvedValue(0);

    await routeFestivalLifecycleUpdate({
      update_id: 2,
      message: {
        message_id: 3,
        from: { id: 42, first_name: "Jordy" },
        chat: { id: 42, type: "private" },
        text: "/festival",
      },
    });

    expect(telegram.sendMessage).toHaveBeenCalledOnce();
    const options = telegram.sendMessage.mock.calls[0][2] as {
      reply_markup?: { inline_keyboard?: Array<Array<{ callback_data?: string; url?: string }>> };
    } | undefined;
    expect(options?.reply_markup?.inline_keyboard?.[0]?.[0]).toMatchObject({
      callback_data: "fs:public42",
    });
    expect(JSON.stringify(options)).not.toContain("festival-setup");
  });

  it("uses the owner dashboard for /menu in private instead of the group companion menu", async () => {
    vi.spyOn(festivalStore, "getCurrentFestivalForOwner").mockResolvedValue(festival());
    vi.spyOn(festivalStore, "getCreationCooldownSeconds").mockResolvedValue(0);

    expect(await routeFestivalLifecycleUpdate({
      update_id: 3,
      message: {
        message_id: 4,
        from: { id: 42, first_name: "Jordy" },
        chat: { id: 42, type: "private" },
        text: "/menu",
      },
    })).toBe(true);

    const payload = JSON.stringify(telegram.sendMessage.mock.calls);
    expect(payload).toContain("Setup verder");
    expect(payload).not.toContain("Timetable");
    expect(payload).not.toContain("Nu live");
  });

  it("rejects group-only commands in private without opening the legacy Space Safari flow", async () => {
    expect(await routeFestivalLifecycleUpdate({
      update_id: 4,
      message: {
        message_id: 5,
        from: { id: 42, first_name: "Jordy" },
        chat: { id: 42, type: "private" },
        text: "/map",
      },
    })).toBe(true);

    expect(telegram.sendMessage).toHaveBeenCalledWith(
      42,
      expect.stringContaining("hoort in je festivalgroep"),
      { reply_markup: { remove_keyboard: true } },
    );
  });

  it("arms map upload and restores the normal Telegram attachment composer", async () => {
    vi.spyOn(festivalStore, "getCurrentFestivalForOwner").mockResolvedValue(festival());
    const clearPending = vi.spyOn(festivalStore, "clearPendingFestival").mockResolvedValue(undefined);
    const clearName = vi.spyOn(festivalStore, "clearFestivalNamePrompt").mockResolvedValue(undefined);
    const clearGroup = vi.spyOn(festivalStore, "clearFestivalGroupLink").mockResolvedValue(undefined);
    const beginMap = vi.spyOn(festivalStore, "beginFestivalMapUpload").mockResolvedValue(festival());

    await routeFestivalLifecycleUpdate({
      update_id: 5,
      message: {
        message_id: 6,
        from: { id: 42, first_name: "Jordy" },
        chat: { id: 42, type: "private" },
        text: "/festival kaart",
      },
    });

    expect(clearPending).toHaveBeenCalledWith(42);
    expect(clearName).toHaveBeenCalledWith(42);
    expect(clearGroup).toHaveBeenCalledWith(42);
    expect(beginMap).toHaveBeenCalledWith(42, "horst-2027-abcd");
    const lastCall = telegram.sendMessage.mock.calls.at(-1);
    expect(lastCall?.[1]).toContain("+ (of de paperclip)");
    expect(lastCall?.[1]).toContain("Foto of Bestand");
    expect(lastCall?.[1]).toContain("geen link");
    expect(lastCall?.[2]).toEqual({ reply_markup: { remove_keyboard: true } });
  });

  it("accepts an image file even when Telegram labels it as a generic document", async () => {
    const current = festival();
    const updated = {
      ...current,
      mapImageUrl: "https://ginder.example/api/festivals/horst-2027-abcd/map-image",
      telegramMapFileId: "file-map",
    };
    vi.spyOn(festivalStore, "getCurrentFestivalForOwner").mockResolvedValue(current);
    vi.spyOn(festivalStore, "getFestivalAwaitingMapUpload").mockResolvedValue(null);
    const updateFestival = vi.spyOn(festivalStore, "updatePersistedFestival").mockResolvedValue(updated);
    const clearMap = vi.spyOn(festivalStore, "clearFestivalMapUpload").mockResolvedValue(undefined);

    expect(await routeFestivalBotSetupUpdate({
      update_id: 6,
      message: {
        message_id: 7,
        from: { id: 42, first_name: "Jordy" },
        chat: { id: 42, type: "private" },
        document: {
          file_id: "file-map",
          file_unique_id: "unique-map",
          file_name: "festival-map.PNG",
          mime_type: "application/octet-stream",
        },
      },
    })).toBe(true);

    expect(updateFestival).toHaveBeenCalledWith("horst-2027-abcd", expect.objectContaining({
      telegramMapFileId: "file-map",
      mapImageUrl: "https://ginder.example/api/festivals/horst-2027-abcd/map-image",
    }));
    expect(clearMap).toHaveBeenCalledWith(42);
    expect(telegram.sendMessage.mock.calls.some(([, text]) => text.includes("Kaart ontvangen"))).toBe(true);
  });

  it("starts map upload immediately after a newly created festival is linked", async () => {
    const created = festival();
    vi.spyOn(festivalStore, "getPendingFestival").mockResolvedValue(pendingFestival());
    vi.spyOn(festivalStore, "claimCreationSlot").mockResolvedValue(true);
    vi.spyOn(festivalStore, "finalizePendingFestival").mockResolvedValue({
      festival: created,
      setupToken: "owner-secret-token",
    });
    vi.spyOn(festivalStore, "updatePersistedFestival").mockImplementation(async (_id, patch) => ({
      ...created,
      ...patch,
    }));
    vi.spyOn(festivalStore, "clearPendingFestival").mockResolvedValue(undefined);
    vi.spyOn(festivalStore, "clearFestivalNamePrompt").mockResolvedValue(undefined);
    vi.spyOn(festivalStore, "clearFestivalGroupLink").mockResolvedValue(undefined);
    const beginMap = vi.spyOn(festivalStore, "beginFestivalMapUpload").mockResolvedValue(created);

    await routeFestivalLifecycleUpdate({
      update_id: 7,
      message: {
        message_id: 8,
        from: { id: 42, first_name: "Jordy" },
        chat: { id: 42, type: "private" },
        chat_shared: { request_id: 73, chat_id: -100123, title: "Horst crew" },
      },
    });

    expect(beginMap).toHaveBeenCalledWith(42, "horst-2027-abcd");
    const privateCopy = telegram.sendMessage.mock.calls
      .filter(([chatId]) => chatId === 42)
      .map(([, text]) => text)
      .join("\n");
    expect(privateCopy).toContain("1/4 · Festivalkaart");
    expect(privateCopy).toContain("Foto of Bestand");
    expect(privateCopy).not.toContain("festival-setup");
  });

  it("answers a committed owner callback only once when its follow-up message fails", async () => {
    vi.spyOn(festivalStore, "archiveFestivalForOwner").mockResolvedValue({
      festival: { ...festival(), chatId: null, archivedAt: "2027-07-12T12:00:00.000Z" },
      previousChatId: null,
    });
    telegram.sendMessage.mockRejectedValueOnce(new Error("Telegram unavailable"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(await routeFestivalLifecycleUpdate({
      update_id: 8,
      callback_query: {
        id: "archive-callback",
        data: "foarchiveyes:public42",
        from: { id: 42, first_name: "Jordy" },
        message: {
          message_id: 9,
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
      update_id: 9,
      message: {
        message_id: 10,
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