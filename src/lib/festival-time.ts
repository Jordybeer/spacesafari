import { DateTime } from "luxon";
import { performerSets, type FestivalSet } from "@/src/data/timetable";
import { FESTIVAL_TIMEZONE, STAGES } from "@/src/data/stages";

export function festivalNow(now?: DateTime): DateTime {
  return (now ?? DateTime.now()).setZone(FESTIVAL_TIMEZONE);
}

export function parseFestivalTime(value: string): DateTime {
  const parsed = DateTime.fromISO(value, { setZone: true });
  if (!parsed.isValid) {
    throw new Error(`Invalid festival timestamp: ${value}`);
  }
  return parsed.setZone(FESTIVAL_TIMEZONE);
}

export function isPlaying(set: FestivalSet, now: DateTime): boolean {
  const start = parseFestivalTime(set.startsAt);
  const end = parseFestivalTime(set.endsAt);
  return now.toMillis() >= start.toMillis() && now.toMillis() < end.toMillis();
}

export function currentSets(now = festivalNow()): FestivalSet[] {
  return performerSets
    .filter((set) => isPlaying(set, now))
    .sort(stageSort);
}

export function nextOnStage(set: FestivalSet): FestivalSet | undefined {
  return performerSets
    .filter(
      (candidate) =>
        candidate.stage === set.stage &&
        parseFestivalTime(candidate.startsAt).toMillis() >=
          parseFestivalTime(set.endsAt).toMillis(),
    )
    .sort((a, b) => parseFestivalTime(a.startsAt).toMillis() - parseFestivalTime(b.startsAt).toMillis())[0];
}

export function nextUpcomingSets(now = festivalNow()): FestivalSet[] {
  const future = performerSets
    .filter((set) => parseFestivalTime(set.startsAt).toMillis() > now.toMillis())
    .sort((a, b) => parseFestivalTime(a.startsAt).toMillis() - parseFestivalTime(b.startsAt).toMillis());

  if (!future.length) return [];
  const earliest = parseFestivalTime(future[0].startsAt).toMillis();
  return future.filter((set) => parseFestivalTime(set.startsAt).toMillis() === earliest).sort(stageSort);
}

export function setsStartingWithin(minutes: number, now = festivalNow()): FestivalSet[] {
  const end = now.plus({ minutes });
  return performerSets
    .filter((set) => {
      const start = parseFestivalTime(set.startsAt);
      return start.toMillis() >= now.toMillis() && start.toMillis() <= end.toMillis();
    })
    .sort((a, b) => parseFestivalTime(a.startsAt).toMillis() - parseFestivalTime(b.startsAt).toMillis());
}

export function festivalHasEnded(now = festivalNow()): boolean {
  const last = performerSets.reduce((max, set) => {
    const end = parseFestivalTime(set.endsAt);
    return end.toMillis() > max.toMillis() ? end : max;
  }, parseFestivalTime(performerSets[0].endsAt));
  return now.toMillis() >= last.toMillis();
}

export function formatClock(iso: string): string {
  return parseFestivalTime(iso).toFormat("HH:mm");
}

export function formatSet(set: FestivalSet): string {
  const stage = STAGES[set.stage];
  const live = set.live ? " · live" : "";
  return [
    `🎧 ${set.artist}${live}`,
    set.genre ?? stage.genre,
    `${set.countryFlag ?? "🌍"} ${set.country ?? "Unverified"}`,
    `${stage.emoji} ${set.stage} • ${formatClock(set.startsAt)}–${formatClock(set.endsAt)}`,
  ].join("\n");
}

function stageSort(a: FestivalSet, b: FestivalSet): number {
  const order = Object.keys(STAGES);
  return order.indexOf(a.stage) - order.indexOf(b.stage);
}
