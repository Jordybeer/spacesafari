import type { ArtistPing } from "./pings";
import type { FestivalSet } from "@/src/data/timetable";
import { getPing, markPingSent, setById } from "./pings";
import { getRedis } from "./storage";
import { formatSet } from "./festival-time";
import { sendMessage } from "./telegram";

export type DeliveryResult = "sent" | "skipped" | "duplicate";

export interface NotificationDeliveryDeps {
  getPing(chatId: string, setId: string): Promise<ArtistPing | null>;
  setById(setId: string): FestivalSet | undefined;
  setLock(key: string): Promise<boolean>;
  clearLock(key: string): Promise<void>;
  send(chatId: string, text: string): Promise<unknown>;
  markSent(ping: ArtistPing): Promise<void>;
}

function defaultDeps(): NotificationDeliveryDeps {
  const redis = getRedis();
  return {
    getPing,
    setById,
    async setLock(key) {
      const result = await redis.set(key, "1", { nx: true, ex: 120 });
      return Boolean(result);
    },
    async clearLock(key) { await redis.del(key); },
    send: (chatId, text) => sendMessage(chatId, text),
    markSent: markPingSent,
  };
}

export function deliveryLockKey(chatId: string, setId: string): string {
  return `ss:ping-delivery-lock:${chatId}:${setId}`;
}

export async function deliverPingNotification(
  chatId: string,
  artistSetId: string,
  deps: NotificationDeliveryDeps = defaultDeps(),
): Promise<DeliveryResult> {
  const ping = await deps.getPing(chatId, artistSetId);
  if (!ping || ping.sentAt) return "skipped";
  const set = deps.setById(artistSetId);
  if (!set) return "skipped";

  const lockKey = deliveryLockKey(chatId, artistSetId);
  if (!(await deps.setLock(lockKey))) return "duplicate";

  try {
    const latest = await deps.getPing(chatId, artistSetId);
    if (!latest || latest.sentAt) return "skipped";
    await deps.send(chatId, ["🔔 Over 15 minuten", "", formatSet(set)].join("\n"));
    await deps.markSent(latest);
    return "sent";
  } catch (error) {
    await deps.clearLock(lockKey);
    throw error;
  }
}
