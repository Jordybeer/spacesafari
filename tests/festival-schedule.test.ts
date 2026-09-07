import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import {
  currentScheduleSets,
  findFestivalSchedule,
  localDateTimeToIso,
  nextScheduleSets,
  upcomingScheduleSets,
  type FestivalScheduleEntry,
} from "@/src/lib/festival-schedule";

const timezone = "Europe/Brussels";
const schedule: FestivalScheduleEntry[] = [
  {
    id: "a",
    artist: "Alpha",
    stage: "Main",
    startsAt: "2027-07-10T18:00:00+02:00",
    endsAt: "2027-07-10T19:00:00+02:00",
    kind: "set",
    live: false,
    note: null,
  },
  {
    id: "b",
    artist: "Beta",
    stage: "Club",
    startsAt: "2027-07-10T19:30:00+02:00",
    endsAt: "2027-07-10T21:00:00+02:00",
    kind: "set",
    live: true,
    note: null,
  },
];

describe("festival schedule helpers", () => {
  it("interprets local setup times in the festival timezone", () => {
    expect(localDateTimeToIso("2027-07-10T18:00", timezone)).toContain("T18:00:00.000+02:00");
  });

  it("finds current and upcoming sets without Space Safari globals", () => {
    const now = DateTime.fromISO("2027-07-10T18:30:00+02:00", { setZone: true });
    expect(currentScheduleSets(schedule, timezone, now).map((entry) => entry.id)).toEqual(["a"]);
    expect(upcomingScheduleSets(schedule, timezone, 90, now).map((entry) => entry.id)).toEqual(["b"]);
  });

  it("finds the next simultaneous start and artist matches", () => {
    const now = DateTime.fromISO("2027-07-10T17:00:00+02:00", { setZone: true });
    expect(nextScheduleSets(schedule, timezone, now).map((entry) => entry.id)).toEqual(["a"]);
    expect(findFestivalSchedule(schedule, "bet").map((entry) => entry.artist)).toEqual(["Beta"]);
  });
});
