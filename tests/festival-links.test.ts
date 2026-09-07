import { describe, expect, it } from "vitest";
import { parseFestivalStartParam } from "@/src/lib/festival-links";
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
});
