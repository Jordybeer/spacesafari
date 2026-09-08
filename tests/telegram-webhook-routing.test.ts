import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  setup: vi.fn(async () => false),
  lifecycle: vi.fn(async () => false),
  group: vi.fn(async () => false),
  legacy: vi.fn(async () => undefined),
  currentFestival: vi.fn(async () => null),
  syncCommands: vi.fn(async () => undefined),
  setMenuButton: vi.fn(async () => undefined),
}));

vi.mock("@/src/lib/bot-router", () => ({ routeTelegramUpdate: mocks.legacy }));
vi.mock("@/src/lib/festival-bot-setup-router", () => ({ routeFestivalBotSetupUpdate: mocks.setup }));
vi.mock("@/src/lib/festival-bot-router", () => ({ routeFestivalLifecycleUpdate: mocks.lifecycle }));
vi.mock("@/src/lib/festival-store", () => ({ getCurrentFestivalForOwner: mocks.currentFestival }));
vi.mock("@/src/lib/group-companion-router", () => ({ routeGroupCompanionUpdate: mocks.group }));
vi.mock("@/src/lib/telegram-command-ui", () => ({ syncTelegramCommandUi: mocks.syncCommands }));
vi.mock("@/src/lib/telegram", () => ({ setCommandsMenuButton: mocks.setMenuButton }));

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
    expect(mocks.syncCommands).toHaveBeenCalledOnce();
    expect(mocks.setMenuButton).not.toHaveBeenCalled();
    expect(mocks.group).toHaveBeenCalledOnce();
    expect(mocks.legacy).not.toHaveBeenCalled();
  });
});