import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  setup: vi.fn(async () => false),
  lifecycle: vi.fn(async () => false),
  group: vi.fn(async () => false),
  legacy: vi.fn(async () => undefined),
  currentFestival: vi.fn(async () => null),
  recoverFestival: vi.fn<() => Promise<{ id: string } | null>>(async () => ({ id: "space-safari-2026" })),
  syncCommands: vi.fn(async () => undefined),
  setMenuButton: vi.fn(async () => undefined),
  sendMessage: vi.fn(async () => ({})),
}));

vi.mock("@/src/lib/bot-router", () => ({ routeTelegramUpdate: mocks.legacy }));
vi.mock("@/src/lib/festival-bot-setup-router", () => ({ routeFestivalBotSetupUpdate: mocks.setup }));
vi.mock("@/src/lib/festival-bot-router", () => ({ routeFestivalLifecycleUpdate: mocks.lifecycle }));
vi.mock("@/src/lib/festival-chat-recovery", () => ({ recoverFestivalForChat: mocks.recoverFestival }));
vi.mock("@/src/lib/festival-store", () => ({ getCurrentFestivalForOwner: mocks.currentFestival }));
vi.mock("@/src/lib/group-companion-router", () => ({ routeGroupCompanionUpdate: mocks.group }));
vi.mock("@/src/lib/telegram-command-ui", () => ({ syncTelegramCommandUi: mocks.syncCommands }));
vi.mock("@/src/lib/telegram", () => ({
  setCommandsMenuButton: mocks.setMenuButton,
  sendMessage: mocks.sendMessage,
}));

import { POST } from "@/app/api/telegram/webhook/route";

function webhookRequest(body: unknown): Request {
  return new Request("https://ginder.example/api/telegram/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-telegram-bot-api-secret-token": "test-secret",
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "test-secret");
  for (const mock of Object.values(mocks)) mock.mockClear();
  mocks.setup.mockResolvedValue(false);
  mocks.lifecycle.mockResolvedValue(false);
  mocks.group.mockResolvedValue(false);
  mocks.recoverFestival.mockResolvedValue({ id: "space-safari-2026" });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Telegram webhook routing", () => {
  it("never sends private commands through the group or legacy Space Safari routers", async () => {
    const response = await POST(webhookRequest({
      update_id: 1,
      message: {
        message_id: 2,
        from: { id: 42, first_name: "Jordy" },
        chat: { id: 42, type: "private" },
        text: "/map",
      },
    }));

    expect(response.status).toBe(200);
    expect(mocks.syncCommands).toHaveBeenCalledOnce();
    expect(mocks.setMenuButton).toHaveBeenCalledWith(42);
    expect(mocks.setup).toHaveBeenCalledOnce();
    expect(mocks.lifecycle).toHaveBeenCalledOnce();
    expect(mocks.recoverFestival).not.toHaveBeenCalled();
    expect(mocks.group).not.toHaveBeenCalled();
    expect(mocks.legacy).not.toHaveBeenCalled();
  });

  it("keeps festival companion routing in Telegram groups", async () => {
    mocks.group.mockResolvedValue(true);

    const response = await POST(webhookRequest({
      update_id: 2,
      message: {
        message_id: 3,
        from: { id: 42, first_name: "Jordy" },
        chat: { id: -100123, type: "supergroup", title: "Horst crew" },
        text: "/map",
      },
    }));

    expect(response.status).toBe(200);
    expect(mocks.recoverFestival).toHaveBeenCalledWith(-100123);
    expect(mocks.group).toHaveBeenCalledOnce();
    expect(mocks.legacy).not.toHaveBeenCalled();
  });

  it("does not leak legacy Space Safari command handling into custom festival groups", async () => {
    mocks.recoverFestival.mockResolvedValue({ id: "horst-2027-abcd" });

    const response = await POST(webhookRequest({
      update_id: 3,
      message: {
        message_id: 4,
        from: { id: 42, first_name: "Jordy" },
        chat: { id: -100123, type: "supergroup", title: "Horst crew" },
        text: "/unknown",
      },
    }));

    expect(response.status).toBe(200);
    expect(mocks.group).toHaveBeenCalledOnce();
    expect(mocks.legacy).not.toHaveBeenCalled();
  });

  it("retains the legacy router for the built-in Space Safari group", async () => {
    const response = await POST(webhookRequest({
      update_id: 4,
      message: {
        message_id: 5,
        from: { id: 42, first_name: "Jordy" },
        chat: { id: -100456, type: "group", title: "Space Safari crew" },
        text: "/unknown",
      },
    }));

    expect(response.status).toBe(200);
    expect(mocks.recoverFestival).toHaveBeenCalledWith(-100456);
    expect(mocks.legacy).toHaveBeenCalledOnce();
  });

  it("keeps /id available in groups without depending on festival linkage", async () => {
    const response = await POST(webhookRequest({
      update_id: 5,
      message: {
        message_id: 6,
        from: { id: 1303637520, first_name: "Jordy" },
        chat: { id: -100789, type: "group", title: "Voodoo Village" },
        text: "/id",
      },
    }));

    expect(response.status).toBe(200);
    expect(mocks.legacy).toHaveBeenCalledOnce();
    expect(mocks.recoverFestival).not.toHaveBeenCalled();
    expect(mocks.group).not.toHaveBeenCalled();
  });

  it("answers instead of 500 when a group has an unrecoverable stale festival link", async () => {
    mocks.recoverFestival.mockResolvedValue(null);

    const response = await POST(webhookRequest({
      update_id: 6,
      message: {
        message_id: 7,
        from: { id: 42, first_name: "Jordy" },
        chat: { id: -100999, type: "supergroup", title: "Broken crew" },
        text: "/map",
      },
    }));

    expect(response.status).toBe(200);
    expect(mocks.group).not.toHaveBeenCalled();
    expect(mocks.legacy).not.toHaveBeenCalled();
    expect(mocks.sendMessage).toHaveBeenCalledWith(-100999, expect.stringContaining("geen geldige Ginder-koppeling"));
  });
});
