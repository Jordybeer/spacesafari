import type { ArtistPing } from "./pings";
import type { FestivalScheduleEntry } from "./festival-schedule";
import { DEFAULT_FESTIVAL_ID } from "./festivals";
import { requireResolvedFestivalDefinition } from "./festival-store";
import { getPing, markPingSent, setByIdForFestival } from "./pings";
import { getRedis } from "./storage";
import { formatScheduleEntry } from "./festival-schedule";
import { sendMessage } from "./telegram";

export type DeliveryResult = "sent" | "skipped" | "duplicate";

export interface NotificationDeliveryDeps {
  getPing(chatId: string, setId: string, festivalId?: string): Promise<ArtistPing | null>;
  setById(setId: string, festivalId?: string): FestivalScheduleEntry | undefined | Promise<FestivalScheduleEntry | undefined>;
  setLock(key: string): Promise<boolean>;
  clearLock(key: string): Promise<void>;
  send(chatId: string, text: string): Promise<unknown>;
  markSent(ping: ArtistPing): Promise<void>;
}

function defaultDeps(): NotificationDeliveryDeps {
  const redis = getRedis();
  return {
    getPing,
    setById: setByIdForFestival,
    async setLock(key) {
      const result = await redis.set(key, "1", { nx: true, ex: 120 });
      return Boolean(result);
    },
    async clearLock(key) { await redis.del(key); },
    send: (chatId, text) => sendMessage(chatId, text),
    markSent: markPingSent,
  };
}

export function deliveryLockKey(
  chatId: string,
  setId: string,
  festivalId = DEFAULT_FESTIVAL_ID,
): string {
  if (festivalId === DEFAULT_FESTIVAL_ID) return `ss:ping-delivery-lock:${chatId}:${setId}`;
  return `ginder:festival:${festivalId}:ping-delivery-lock:${chatId}:${setId}`;
}

export async function deliverPingNotification(
  chatId: string,
  artistSetId: string,
  deps: NotificationDeliveryDeps = defaultDeps(),
  festivalId = DEFAULT_FESTIVAL_ID,
): Promise<DeliveryResult> {
  const ping = await deps.getPing(chatId, artistSetId, festivalId);
  if (!ping || ping.sentAt) return "skipped";
  const set = await deps.setById(artistSetId, festivalId);
  if (!set) return "skipped";

  const lockKey = deliveryLockKey(chatId, artistSetId, festivalId);
  if (!(await deps.setLock(lockKey))) return "duplicate";

  try {
    const latest = await deps.getPing(chatId, artistSetId, festivalId);
    if (!latest || latest.sentAt) return "skipped";
    const festival = await requireResolvedFestivalDefinition(festivalId);
    await deps.send(chatId, ["🔔 Over 15 minuten", "", formatScheduleEntry(set, festival.timezone)].join("\n"));
    await deps.markSent(latest);
    return "sent";
  } catch (error) {
    await deps.clearLock(lockKey);
    throw error;
  }
}
