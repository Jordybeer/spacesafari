import { Client } from "@upstash/qstash";
import { DateTime } from "luxon";
import { performerSets, type FestivalSet } from "@/src/data/timetable";
import { FESTIVAL_TIMEZONE } from "@/src/data/stages";
import { getRedis } from "./storage";
import { requireEnv } from "./env";

export interface ArtistPing {
  chatId: string;
  artistSetId: string;
  notifyAt: string;
  createdAt: string;
  sentAt?: string;
  qstashMessageId?: string;
}

function pingKey(chatId: string, setId: string) {
  return `ss:ping:${chatId}:${setId}`;
}
function pingIndex(chatId: string) {
  return `ss:pings:${chatId}`;
}

export function setById(id: string): FestivalSet | undefined {
  return performerSets.find((set) => set.id === id);
}

export async function createPing(chatId: string, set: FestivalSet): Promise<{
  ping: ArtistPing;
  duplicate: boolean;
}> {
  const redis = getRedis();
  const existing = await redis.get<ArtistPing>(pingKey(chatId, set.id));
  if (existing) return { ping: existing, duplicate: true };

  const start = DateTime.fromISO(set.startsAt, { setZone: true }).setZone(FESTIVAL_TIMEZONE);
  const notify = start.minus({ minutes: 15 });
  const now = DateTime.now().setZone(FESTIVAL_TIMEZONE);
  const ping: ArtistPing = {
    chatId,
    artistSetId: set.id,
    notifyAt: notify.toISO()!,
    createdAt: now.toISO()!,
  };

  await redis.set(pingKey(chatId, set.id), ping, { ex: 7 * 24 * 60 * 60 });
  await redis.sadd(pingIndex(chatId), set.id);
  await redis.expire(pingIndex(chatId), 7 * 24 * 60 * 60);

  try {
    const client = new Client({ token: requireEnv("QSTASH_TOKEN"), enableTelemetry: false });
    const delaySeconds = Math.max(0, Math.floor(notify.diff(now, "seconds").seconds));
    const result = await client.publishJSON({
      url: `${requireEnv("APP_URL")}/api/notifications/deliver`,
      body: { chatId, artistSetId: set.id },
      delay: delaySeconds,
      retries: 4,
    });
    ping.qstashMessageId = result.messageId;
    await redis.set(pingKey(chatId, set.id), ping, { ex: 7 * 24 * 60 * 60 });
    return { ping, duplicate: false };
  } catch (error) {
    await Promise.all([
      redis.del(pingKey(chatId, set.id)),
      redis.srem(pingIndex(chatId), set.id),
    ]);
    throw error;
  }
}

export async function listPings(chatId: string): Promise<ArtistPing[]> {
  const redis = getRedis();
  const ids = await redis.smembers<string[]>(pingIndex(chatId));
  if (!ids.length) return [];
  const values = await Promise.all(ids.map((id: string) => redis.get<ArtistPing>(pingKey(chatId, id))));
  const stale = ids.filter((_: string, index: number) => !values[index]);
  if (stale.length) await redis.srem(pingIndex(chatId), ...stale);
  return values.filter((value: ArtistPing | null): value is ArtistPing => value !== null && !value.sentAt);
}

export async function deletePing(chatId: string, setId: string): Promise<boolean> {
  const redis = getRedis();
  const removed = await redis.del(pingKey(chatId, setId));
  await redis.srem(pingIndex(chatId), setId);
  return removed > 0;
}

export async function getPing(chatId: string, setId: string): Promise<ArtistPing | null> {
  return (await getRedis().get<ArtistPing>(pingKey(chatId, setId))) ?? null;
}

export async function markPingSent(ping: ArtistPing): Promise<void> {
  const redis = getRedis();
  const updated = { ...ping, sentAt: new Date().toISOString() };
  await Promise.all([
    redis.set(pingKey(ping.chatId, ping.artistSetId), updated, { ex: 24 * 60 * 60 }),
    redis.srem(pingIndex(ping.chatId), ping.artistSetId),
  ]);
}
