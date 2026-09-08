import { afterEach, describe, expect, it, vi } from "vitest";
import { SPACE_SAFARI_2026 } from "@/src/lib/festivals";
import * as festivalStore from "@/src/lib/festival-store";
import { routeGroupCompanionUpdate } from "@/src/lib/group-companion-router";
import * as telegram from "@/src/lib/telegram";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("custom festival group boundaries", () => {
  it("swallows legacy Space Safari callback buttons in a custom festival group", async () => {
    vi.spyOn(festivalStore, "getFestivalForChat").mockResolvedValue({
      ...SPACE_SAFARI_2026,
      id: "horst-2027-abcd",
      name: "Horst",
      year: 2027,
    });
    const answer = vi.spyOn(telegram, "answerCallbackQuery").mockResolvedValue(undefined);

    const handled = await routeGroupCompanionUpdate({
      update_id: 1,
      callback_query: {
        id: "callback-1",
        data: "p:legacy-space-safari-set",
        from: { id: 42, first_name: "Jordy" },
        message: {
          message_id: 7,
          chat: { id: -100123, type: "supergroup", title: "Horst crew" },
        },
      },
    });

    expect(handled).toBe(true);
    expect(answer).toHaveBeenCalledWith("callback-1", "Deze oude knop hoort bij een ander festival.");
  });

  it("leaves legacy callbacks available for the built-in Space Safari festival", async () => {
    vi.spyOn(festivalStore, "getFestivalForChat").mockResolvedValue(SPACE_SAFARI_2026);
    const answer = vi.spyOn(telegram, "answerCallbackQuery").mockResolvedValue(undefined);

    const handled = await routeGroupCompanionUpdate({
      update_id: 2,
      callback_query: {
        id: "callback-2",
        data: "m:legacy-space-safari-anchor",
        from: { id: 42, first_name: "Jordy" },
        message: {
          message_id: 8,
          chat: { id: -100456, type: "group", title: "Space Safari crew" },
        },
      },
    });

    expect(handled).toBe(false);
    expect(answer).not.toHaveBeenCalled();
  });

  it("keeps custom festival map administration out of the legacy Space Safari route", async () => {
    vi.spyOn(festivalStore, "getFestivalForChat").mockResolvedValue({
      ...SPACE_SAFARI_2026,
      id: "horst-2027-abcd",
      name: "Horst",
      year: 2027,
    });
    const send = vi.spyOn(telegram, "sendMessage").mockResolvedValue(undefined);

    const handled = await routeGroupCompanionUpdate({
      update_id: 3,
      message: {
        message_id: 9,
        from: { id: 42, first_name: "Jordy" },
        chat: { id: -100123, type: "supergroup", title: "Horst crew" },
        text: "/mapadmin",
      },
    });

    expect(handled).toBe(true);
    expect(send).toHaveBeenCalledWith(
      -100123,
      "⚙️ Beheer de kaart van Horst via /festival in een privégesprek met Ginder.",
    );
  });
});
