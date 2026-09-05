import type { StageName } from "./stages";

export type ScheduleKind = "set" | "break" | "soundcheck";

export interface FestivalSet {
  id: string;
  artist: string;
  stage: StageName;
  startsAt: string;
  endsAt: string;
  kind: ScheduleKind;
  live: boolean;
  genre: string | null;
  country: string | null;
  countryCode: string | null;
  countryFlag: string | null;
  metadataSource: string;
  sourceDay: string;
  note: string | null;
}

/**
 * Canonical Space Safari 2026 schedule.
 *
 * Times/stages come only from the three official Space Safari timetable images.
 * Cross-midnight continuations shown on the next image are de-duplicated into one
 * canonical entry. Breaks and soundchecks are retained for integrity verification.
 *
 * The split source modules are an implementation detail to keep review diffs small.
 * This exported array remains the application's canonical schedule.
 */
import { fridaySupernova } from "./schedule/friday-supernova";
import { fridayNebula } from "./schedule/friday-nebula";
import { fridayZodiac } from "./schedule/friday-zodiac";
import { fridayGalaxy } from "./schedule/friday-galaxy";
import { saturdaySupernova } from "./schedule/saturday-supernova";
import { saturdayNebula } from "./schedule/saturday-nebula";
import { saturdayZodiac } from "./schedule/saturday-zodiac";
import { saturdayGalaxy } from "./schedule/saturday-galaxy";
import { sundaySupernova } from "./schedule/sunday-supernova";
import { sundayNebula } from "./schedule/sunday-nebula";
import { sundayZodiac } from "./schedule/sunday-zodiac";
import { sundayGalaxy } from "./schedule/sunday-galaxy";

export const timetable: FestivalSet[] = [
  ...fridaySupernova,
  ...fridayNebula,
  ...fridayZodiac,
  ...fridayGalaxy,
  ...saturdaySupernova,
  ...saturdayNebula,
  ...saturdayZodiac,
  ...saturdayGalaxy,
  ...sundaySupernova,
  ...sundayNebula,
  ...sundayZodiac,
  ...sundayGalaxy,
];

export const performerSets = timetable.filter((entry) => entry.kind === "set");
