import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { performerSets } from "@/src/data/timetable";
import { currentSets, festivalHasEnded, isPlaying, nextOnStage, nextUpcomingSets } from "@/src/lib/festival-time";

const at = (iso: string) => DateTime.fromISO(iso, { setZone: true });
const set = (artist: string, stage?: string) => performerSets.find((item) => item.artist === artist && (!stage || item.stage === stage))!;

describe("festival time", () => {
  it("finds an artist during a set", () => {
    expect(currentSets(at("2026-09-06T00:15:00+02:00")).map((item) => item.artist)).toContain("Sevenum Six");
  });

  it("includes exact set start", () => {
    expect(isPlaying(set("Sevenum Six"), at("2026-09-06T00:00:00+02:00"))).toBe(true);
  });

  it("excludes one second before set start", () => {
    expect(isPlaying(set("Sevenum Six"), at("2026-09-05T23:59:59+02:00"))).toBe(false);
  });

  it("excludes exact set end", () => {
    expect(isPlaying(set("Sevenum Six"), at("2026-09-06T01:30:00+02:00"))).toBe(false);
  });

  it("returns the next artist on the same stage", () => {
    expect(nextOnStage(set("Sevenum Six"))?.artist).toBe("InfraKontrol");
  });

  it("returns simultaneous stages", () => {
    const names = currentSets(at("2026-09-05T20:35:00+02:00")).map((item) => item.stage);
    expect(new Set(names)).toEqual(new Set(["Supernova", "Nebula", "Zodiac", "Galaxy"]));
  });

  it("returns next upcoming when nothing is playing", () => {
    const next = nextUpcomingSets(at("2026-09-04T13:00:00+02:00"));
    expect(next.map((item) => item.artist)).toEqual(["Little Man"]);
  });

  it("detects festival end", () => {
    expect(festivalHasEnded(at("2026-09-07T00:00:00+02:00"))).toBe(true);
    expect(festivalHasEnded(at("2026-09-06T23:59:59+02:00"))).toBe(false);
  });

  it("handles cross-midnight sets", () => {
    expect(isPlaying(set("Elowinz"), at("2026-09-05T00:30:00+02:00"))).toBe(true);
  });

  it("keeps Europe/Brussels semantics when input is UTC", () => {
    const names = currentSets(DateTime.fromISO("2026-09-05T22:15:00Z")).map((item) => item.artist);
    expect(names).toContain("Sevenum Six");
  });
});
