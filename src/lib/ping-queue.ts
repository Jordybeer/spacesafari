import { send } from "@vercel/queue";
import { DEFAULT_FESTIVAL_ID } from "./festivals";

export const PING_REMINDER_TOPIC = "space-safari-ping-reminders";
// Keep each hop comfortably inside the queue's 24-hour retention window.
// Longer reminders are re-enqueued by the consumer when a hop wakes up.
export const MAX_QUEUE_DELAY_SECONDS = 23 * 60 * 60;
export const QUEUE_RETENTION_SECONDS = 24 * 60 * 60;

export interface PingReminderMessage {
  chatId: string;
  artistSetId: string;
  festivalId?: string;
  createdAt: string;
  hop: number;
}

export function secondsUntil(iso: string, nowMs = Date.now()): number {
  const targetMs = Date.parse(iso);
  if (!Number.isFinite(targetMs)) throw new Error(`Invalid reminder timestamp: ${iso}`);
  return Math.max(0, Math.ceil((targetMs - nowMs) / 1000));
}

export function queueDelaySeconds(iso: string, nowMs = Date.now()): number {
  return Math.min(MAX_QUEUE_DELAY_SECONDS, secondsUntil(iso, nowMs));
}

function idempotencyKey(message: PingReminderMessage): string {
  const created = Date.parse(message.createdAt);
  const festival = message.festivalId ?? DEFAULT_FESTIVAL_ID;
  return `ginder-ping-${festival}-${message.chatId}-${message.artistSetId}-${Number.isFinite(created) ? created : message.createdAt}-${message.hop}`.slice(0, 256);
}

export async function enqueuePingReminder(input: {
  chatId: string;
  artistSetId: string;
  festivalId?: string;
  createdAt: string;
  notifyAt: string;
  hop?: number;
}): Promise<string | null> {
  const message: PingReminderMessage = {
    chatId: input.chatId,
    artistSetId: input.artistSetId,
    ...(input.festivalId && input.festivalId !== DEFAULT_FESTIVAL_ID ? { festivalId: input.festivalId } : {}),
    createdAt: input.createdAt,
    hop: input.hop ?? 0,
  };

  const result = await send(PING_REMINDER_TOPIC, message, {
    delaySeconds: queueDelaySeconds(input.notifyAt),
    retentionSeconds: QUEUE_RETENTION_SECONDS,
    idempotencyKey: idempotencyKey(message),
  });

  return result.messageId;
}
