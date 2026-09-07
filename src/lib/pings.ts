import { DateTime } from "luxon";
import { performerSets, type FestivalSet } from "@/src/data/timetable";
import { FESTIVAL_TIMEZONE } from "@/src/data/stages";
import { DEFAULT_FESTIVAL_ID } from "./festivals";
import { requireResolvedFestivalDefinition } from "./festival-store";
import { getFestivalSchedule, performerEntries, type FestivalScheduleEntry } from "./festival-schedule";
import { enqueuePingReminder } from "./ping-queue";
import { getRedis } from "./storage";

export interface ArtistPing {
  chatId: string;
  artistSetId: string;
  festivalId?: string;
  notifyAt: string;
  createdAt: string;
  sentAt?: string;
  queueMessageId?: string;
}

type PingSet = Pick<FestivalScheduleEntry, "id" | "startsAt">;

function scopePrefix(festivalId = DEFAULT_FESTIVAL_ID): string {
  return festivalId === DEFAULT_FESTIVAL_ID ? "ss" : `ginder:festival:${festivalId}`;
}

function pingKey(chatId: string, setId: string, festivalId = DEFAULT_FESTIVAL_ID) {
  return `${scopePrefix(festivalId)}:ping:${chatId}:${setId}`;
}
function pingIndex(chatId: string, festivalId = DEFAULT_FESTIVAL_ID) {
  return `${scopePrefix(festivalId)}:pings:${chatId}`;
}

export function setById(id: string): FestivalSet | undefined {
  return performerSets.find((set) => set.id === id);
}

export async function setByIdForFestival(
  id: string,
  festivalId = DEFAULT_FESTIVAL_ID,
): Promise<FestivalScheduleEntry | FestivalSet | undefined> {
  if (festivalId === DEFAULT_FESTIVAL_ID) return setById(id);
  const festival = await requireResolvedFestivalDefinition(festivalId);
  const schedule = await getFestivalSchedule(festival);
  return performerEntries(schedule).find((set) => set.id === id);
}

export async function createPing(
  chatId: string,
  set: PingSet,
  festivalId = DEFAULT_FESTIVAL_ID,
  timezone = FESTIVAL_TIMEZONE,
): Promise<{
  ping: ArtistPing;
  duplicate: boolean;
}> {
  const redis = getRedis();
  const existing = await redis.get<ArtistPing>(pingKey(chatId, set.id, festivalId));
  if (existing) return { ping: existing, duplicate: true };

  const start = DateTime.fromISO(set.startsAt, { setZone: true }).setZone(timezone);
  const notify = start.minus({ minutes: 15 });
  const now = DateTime.now().setZone(timezone);
  const ping: ArtistPing = {
    chatId,
    artistSetId: set.id,
    ...(festivalId !== DEFAULT_FESTIVAL_ID ? { festivalId } : {}),
    notifyAt: notify.toISO()!,
    createdAt: now.toISO()!,
  };

  await redis.set(pingKey(chatId, set.id, festivalId), ping, { ex: 7 * 24 * 60 * 60 });
  await redis.sadd(pingIndex(chatId, festivalId), set.id);
  await redis.expire(pingIndex(chatId, festivalId), 7 * 24 * 60 * 60);

  try {
    ping.queueMessageId = (await enqueuePingReminder({
      chatId,
      artistSetId: set.id,
      festivalId,
      createdAt: ping.createdAt,
      notifyAt: ping.notifyAt,
    })) ?? undefined;
    await redis.set(pingKey(chatId, set.id, festivalId), ping, { ex: 7 * 24 * 60 * 60 });
    return { ping, duplicate: false };
  } catch (error) {
    await Promise.all([
      redis.del(pingKey(chatId, set.id, festivalId)),
      redis.srem(pingIndex(chatId, festivalId), set.id),
    ]);
    throw error;
  }
}

export async function listPings(chatId: string, festivalId = DEFAULT_FESTIVAL_ID): Promise<ArtistPing[]> {
  const redis = getRedis();
  const ids = await redis.smembers<string[]>(pingIndex(chatId, festivalId));
  if (!ids.length) return [];
  const values = await Promise.all(ids.map((id: string) => redis.get<ArtistPing>(pingKey(chatId, id, festivalId))));
  const stale = ids.filter((_: string, index: number) => !values[index]);
  if (stale.length) await redis.srem(pingIndex(chatId, festivalId), ...stale);
  return values.filter((value: ArtistPing | null): value is ArtistPing => value !== null && !value.sentAt);
}

export async function deletePing(
  chatId: string,
  setId: string,
  festivalId = DEFAULT_FESTIVAL_ID,
): Promise<boolean> {
  const redis = getRedis();
  const removed = await redis.del(pingKey(chatId, setId, festivalId));
  await redis.srem(pingIndex(chatId, festivalId), setId);
  return removed > 0;
}

export async function getPing(
  chatId: string,
  setId: string,
  festivalId = DEFAULT_FESTIVAL_ID,
): Promise<ArtistPing | null> {
  return (await getRedis().get<ArtistPing>(pingKey(chatId, setId, festivalId))) ?? null;
}

export async function markPingSent(ping: ArtistPing): Promise<void> {
  const redis = getRedis();
  const festivalId = ping.festivalId ?? DEFAULT_FESTIVAL_ID;
  const updated = { ...ping, sentAt: new Date().toISOString() };
  await Promise.all([
    redis.set(pingKey(ping.chatId, ping.artistSetId, festivalId), updated, { ex: 24 * 60 * 60 }),
    redis.srem(pingIndex(ping.chatId, festivalId), ping.artistSetId),
  ]);
}
