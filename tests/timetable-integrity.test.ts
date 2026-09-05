import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { performerSets, timetable } from "@/src/data/timetable";
import { STAGES } from "@/src/data/stages";
import { TIMETABLE_VERIFICATION } from "@/src/data/verification";

describe("official timetable integrity", () => {
  it("matches the verified image counts", () => {
    expect(timetable).toHaveLength(TIMETABLE_VERIFICATION.totalScheduleEntryCount);
    expect(performerSets).toHaveLength(TIMETABLE_VERIFICATION.performerSetCount);
  });

  it("has unique ids and valid timestamps", () => {
    expect(new Set(timetable.map((item) => item.id)).size).toBe(timetable.length);
    for (const item of timetable) {
      const start = DateTime.fromISO(item.startsAt, { setZone: true });
      const end = DateTime.fromISO(item.endsAt, { setZone: true });
      expect(start.isValid, item.id).toBe(true);
      expect(end.isValid, item.id).toBe(true);
      expect(end.toMillis(), item.id).toBeGreaterThan(start.toMillis());
      expect(Object.hasOwn(STAGES, item.stage), item.id).toBe(true);
      if (item.countryCode !== null) expect(item.countryCode, item.id).toMatch(/^[A-Z]{2}$/);
    }
  });

  it("contains no accidental same-stage overlap", () => {
    for (const stage of Object.keys(STAGES)) {
      const rows = timetable
        .filter((item) => item.stage === stage)
        .sort((a, b) => DateTime.fromISO(a.startsAt).toMillis() - DateTime.fromISO(b.startsAt).toMillis());
      for (let i = 1; i < rows.length; i++) {
        const previousEnd = DateTime.fromISO(rows[i - 1].endsAt, { setZone: true }).toMillis();
        const currentStart = DateTime.fromISO(rows[i].startsAt, { setZone: true }).toMillis();
        expect(currentStart, `${stage}: ${rows[i - 1].artist} -> ${rows[i].artist}`).toBeGreaterThanOrEqual(previousEnd);
      }
    }
  });

  it("preserves known cross-midnight continuations", () => {
    const elowinz = performerSets.find((item) => item.artist === "Elowinz")!;
    const motel = performerSets.find((item) => item.artist === "Le Motel & Simsaara")!;
    const bukkha = performerSets.find((item) => item.artist === "Bukkha")!;
    expect(elowinz.endsAt).toBe("2026-09-05T01:00:00+02:00");
    expect(motel.endsAt).toBe("2026-09-05T01:00:00+02:00");
    expect(bukkha.endsAt).toBe("2026-09-05T00:30:00+02:00");
  });
});
