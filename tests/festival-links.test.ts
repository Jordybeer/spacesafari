import { describe, expect, it } from "vitest";
import { festivalSelectorForContext, parseFestivalStartParam } from "@/src/lib/festival-links";
import { DEFAULT_FESTIVAL_ID } from "@/src/lib/festivals";

const ROOM = "abcdefghijklmnopqrstuv";

describe("festival launch parameters", () => {
  it("keeps legacy Space Safari map launches working", () => {
    expect(parseFestivalStartParam("map")).toEqual({ selector: DEFAULT_FESTIVAL_ID, roomToken: null });
    expect(parseFestivalStartParam(`room_${ROOM}`)).toEqual({ selector: DEFAULT_FESTIVAL_ID, roomToken: ROOM });
  });

  it("parses a Ginder festival selector", () => {
    expect(parseFestivalStartParam("f_abCD1234")).toEqual({ selector: "abCD1234", roomToken: null });
  });

  it("parses a festival-scoped private group room", () => {
    expect(parseFestivalStartParam(`fr_abCD1234_${ROOM}`)).toEqual({ selector: "abCD1234", roomToken: ROOM });
  });

  it("does not guess malformed launch parameters", () => {
    expect(parseFestivalStartParam("fr_bad_short")).toEqual({ selector: null, roomToken: null });
    expect(parseFestivalStartParam("something_else")).toEqual({ selector: null, roomToken: null });
  });

  it("lets signed Mini App launch context win over a client selector", () => {
    expect(festivalSelectorForContext("miniapp", "f_abCD1234", "otherFestival")).toBe("abCD1234");
    expect(festivalSelectorForContext("miniapp", null, "otherFestival")).toBe(DEFAULT_FESTIVAL_ID);
  });

  it("allows an explicit selector for browser login flows", () => {
    expect(festivalSelectorForContext("web", null, "festival-browser")).toBe("festival-browser");
    expect(festivalSelectorForContext(null, null, null)).toBe(DEFAULT_FESTIVAL_ID);
  });
});
