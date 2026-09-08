import { beforeEach, describe, expect, it, vi } from "vitest";

const telegram = vi.hoisted(() => ({
  setBotCommands: vi.fn(async () => undefined),
  setCommandsMenuButton: vi.fn(async () => undefined),
}));

vi.mock("@/src/lib/telegram", () => ({
  setBotCommands: telegram.setBotCommands,
  setCommandsMenuButton: telegram.setCommandsMenuButton,
}));

import {
  GROUP_ADMIN_BOT_COMMANDS,
  GROUP_BOT_COMMANDS,
  PRIVATE_BOT_COMMANDS,
  syncTelegramCommandUi,
} from "@/src/lib/telegram-command-ui";

beforeEach(() => {
  telegram.setBotCommands.mockClear();
  telegram.setCommandsMenuButton.mockClear();
});

describe("Telegram command UI", () => {
  it("keeps owner commands private and festival companion commands in groups", async () => {
    await syncTelegramCommandUi(true);

    expect(PRIVATE_BOT_COMMANDS.map(({ command }) => command)).toEqual([
      "start", "festival", "menu", "id", "help",
    ]);
    expect(PRIVATE_BOT_COMMANDS.some(({ command }) => ["map", "live", "meet", "tent"].includes(command))).toBe(false);
    expect(GROUP_BOT_COMMANDS.some(({ command }) => command === "festival")).toBe(false);
    expect(GROUP_BOT_COMMANDS.some(({ command }) => command === "map")).toBe(true);
    expect(GROUP_BOT_COMMANDS.some(({ command }) => command === "id")).toBe(true);
    expect(GROUP_ADMIN_BOT_COMMANDS.at(-1)?.command).toBe("mapadmin");

    expect(telegram.setBotCommands).toHaveBeenNthCalledWith(1, PRIVATE_BOT_COMMANDS);
    expect(telegram.setBotCommands).toHaveBeenNthCalledWith(2, PRIVATE_BOT_COMMANDS, { type: "all_private_chats" });
    expect(telegram.setBotCommands).toHaveBeenNthCalledWith(3, GROUP_BOT_COMMANDS, { type: "all_group_chats" });
    expect(telegram.setBotCommands).toHaveBeenNthCalledWith(4, GROUP_ADMIN_BOT_COMMANDS, { type: "all_chat_administrators" });
    expect(telegram.setCommandsMenuButton).toHaveBeenCalledWith();
  });
});
