import { DateTime } from "luxon";
import { timetable as spaceSafariTimetable } from "@/src/data/timetable";
import { DEFAULT_FESTIVAL_ID, type FestivalDefinition } from "./festivals";
import { getRedis } from "./storage";

export type FestivalScheduleKind = "set" | "break" | "soundcheck";

export interface FestivalScheduleEntry {
  id: string;
  artist: string;
  stage: string;
  startsAt: string;
  endsAt: string;
  kind: FestivalScheduleKind;
  live: boolean;
  note: string | null;
}

function scheduleKey(festivalId: string): string {
  return `ginder:festival:${festivalId}:timetable`;
}

function byStart(a: FestivalScheduleEntry, b: FestivalScheduleEntry): number {
  return Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.stage.localeCompare(b.stage);
}

function normalize(entries: FestivalScheduleEntry[]): FestivalScheduleEntry[] {
  return entries
    .map((entry) => ({
      ...entry,
      artist: entry.artist.trim(),
      stage: entry.stage.trim(),
      note: entry.note?.trim() || null,
    }))
    .sort(byStart);
}

function builtInSchedule(): FestivalScheduleEntry[] {
  return spaceSafariTimetable.map((entry) => ({
    id: entry.id,
    artist: entry.artist,
    stage: entry.stage,
    startsAt: entry.startsAt,
    endsAt: entry.endsAt,
    kind: entry.kind,
    live: entry.live,
    note: entry.note,
  }));
}

export async function getFestivalSchedule(festival: FestivalDefinition): Promise<FestivalScheduleEntry[]> {
  if (festival.id === DEFAULT_FESTIVAL_ID) return builtInSchedule();
  const stored = await getRedis().get<FestivalScheduleEntry[]>(scheduleKey(festival.id));
  return Array.isArray(stored) ? normalize(stored) : [];
}

export async function saveFestivalSchedule(
  festival: FestivalDefinition,
  entries: FestivalScheduleEntry[],
): Promise<FestivalScheduleEntry[]> {
  if (festival.id === DEFAULT_FESTIVAL_ID) {
    throw new Error("De ingebouwde Space Safari timetable wordt niet via Ginder overschreven.");
  }
  const next = normalize(entries);
  await getRedis().set(scheduleKey(festival.id), next);
  return next;
}

export function performerEntries(entries: FestivalScheduleEntry[]): FestivalScheduleEntry[] {
  return entries.filter((entry) => entry.kind === "set");
}

export function scheduleTime(iso: string, timezone: string): DateTime {
  const parsed = DateTime.fromISO(iso, { setZone: true });
  if (!parsed.isValid) throw new Error(`Ongeldige timetable-tijd: ${iso}`);
  return parsed.setZone(timezone);
}

export function localDateTimeToIso(value: string, timezone: string): string {
  const parsed = DateTime.fromISO(value, { zone: timezone });
  if (!parsed.isValid) throw new Error(`Ongeldige datum/tijd: ${value}`);
  return parsed.toISO()!;
}

export function currentScheduleSets(
  entries: FestivalScheduleEntry[],
  timezone: string,
  now = DateTime.now().setZone(timezone),
): FestivalScheduleEntry[] {
  return performerEntries(entries)
    .filter((entry) => {
      const start = scheduleTime(entry.startsAt, timezone);
      const end = scheduleTime(entry.endsAt, timezone);
      return now.toMillis() >= start.toMillis() && now.toMillis() < end.toMillis();
    })
    .sort((a, b) => a.stage.localeCompare(b.stage));
}

export function upcomingScheduleSets(
  entries: FestivalScheduleEntry[],
  timezone: string,
  minutes: number,
  now = DateTime.now().setZone(timezone),
): FestivalScheduleEntry[] {
  const until = now.plus({ minutes });
  return performerEntries(entries)
    .filter((entry) => {
      const start = scheduleTime(entry.startsAt, timezone);
      return start.toMillis() >= now.toMillis() && start.toMillis() <= until.toMillis();
    })
    .sort(byStart);
}

export function nextScheduleSets(
  entries: FestivalScheduleEntry[],
  timezone: string,
  now = DateTime.now().setZone(timezone),
): FestivalScheduleEntry[] {
  const future = performerEntries(entries)
    .filter((entry) => scheduleTime(entry.startsAt, timezone).toMillis() > now.toMillis())
    .sort(byStart);
  if (!future.length) return [];
  const first = scheduleTime(future[0].startsAt, timezone).toMillis();
  return future.filter((entry) => scheduleTime(entry.startsAt, timezone).toMillis() === first);
}

export function festivalScheduleHasEnded(
  entries: FestivalScheduleEntry[],
  timezone: string,
  now = DateTime.now().setZone(timezone),
): boolean {
  const sets = performerEntries(entries);
  if (!sets.length) return false;
  const lastEnd = Math.max(...sets.map((entry) => scheduleTime(entry.endsAt, timezone).toMillis()));
  return now.toMillis() >= lastEnd;
}

export function formatScheduleClock(iso: string, timezone: string): string {
  return scheduleTime(iso, timezone).toFormat("HH:mm");
}

export function formatScheduleEntry(entry: FestivalScheduleEntry, timezone: string): string {
  return [
    `🎧 ${entry.artist}${entry.live ? " · live" : ""}`,
    `📍 ${entry.stage} • ${formatScheduleClock(entry.startsAt, timezone)}–${formatScheduleClock(entry.endsAt, timezone)}`,
  ].join("\n");
}

export function findFestivalSchedule(
  entries: FestivalScheduleEntry[],
  query: string,
): FestivalScheduleEntry[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return [];
  return performerEntries(entries)
    .filter((entry) => entry.artist.toLocaleLowerCase().includes(normalized))
    .sort(byStart);
}
