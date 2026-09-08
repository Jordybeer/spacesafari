import { describe, expect, it } from "vitest";
import { parseFestivalTimetableText, summarizeFestivalTimetable } from "@/src/lib/festival-timetable-import";

const options = { timezone: "Europe/Brussels", year: 2026 };

describe("festival timetable text import", () => {
  it("parses the simple semicolon format used by the bot", () => {
    const entries = parseFestivalTimetableText([
      "2026-09-11;20:00;21:30;Main;Alpha",
      "2026-09-11;21:30;23:00;Main;Beta",
    ].join("\n"), options);

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ artist: "Alpha", stage: "Main", kind: "set" });
    expect(Date.parse(entries[0].endsAt)).toBeGreaterThan(Date.parse(entries[0].startsAt));
  });

  it("supports normal comma CSV with headers and quoted commas", () => {
    const entries = parseFestivalTimetableText([
      "date,start,end,stage,artist,live,note",
      "2026-09-12,18:00,19:00,\"Main, Hall\",\"DJ, Example\",yes,opening",
    ].join("\n"), options);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      artist: "DJ, Example",
      stage: "Main, Hall",
      live: true,
      note: "opening",
    });
  });

  it("rolls an after-midnight end time into the next day", () => {
    const [entry] = parseFestivalTimetableText(
      "12/09/2026;23:30;01:00;Forest;Night Artist",
      options,
    );

    expect(Date.parse(entry.endsAt)).toBeGreaterThan(Date.parse(entry.startsAt));
    expect(new Date(entry.endsAt).getUTCDate()).not.toBe(new Date(entry.startsAt).getUTCDate());
  });

  it("parses the compact pasted format and produces a short preview", () => {
    const entries = parseFestivalTimetableText(
      "13/09 14:00-15:15 | Lake | Sunday Artist",
      options,
    );

    expect(entries[0].artist).toBe("Sunday Artist");
    expect(summarizeFestivalTimetable(entries, options.timezone)).toContain("Lake · Sunday Artist");
  });

  it("rejects malformed rows instead of silently saving partial data", () => {
    expect(() => parseFestivalTimetableText(
      "2026-09-11;nope;21:30;Main;Artist",
      options,
    )).toThrow("Ongeldige tijd");
  });
});
