import { handleCallback } from "@vercel/queue";
import { deliverPingNotification } from "@/src/lib/notification-delivery";
import { enqueuePingReminder, secondsUntil, type PingReminderMessage } from "@/src/lib/ping-queue";
import { getPing } from "@/src/lib/pings";

export const POST = handleCallback(
  async (message: PingReminderMessage) => {
    const ping = await getPing(message.chatId, message.artistSetId);

    // Deleted, already delivered, or superseded reminders are safe no-ops.
    if (!ping || ping.sentAt || ping.createdAt !== message.createdAt) return;

    // Vercel Queues can delay a single message for up to seven days. If a
    // future edition ever schedules farther ahead, hop forward durably.
    if (secondsUntil(ping.notifyAt) > 2) {
      await enqueuePingReminder({
        chatId: ping.chatId,
        artistSetId: ping.artistSetId,
        createdAt: ping.createdAt,
        notifyAt: ping.notifyAt,
        hop: message.hop + 1,
      });
      return;
    }

    await deliverPingNotification(message.chatId, message.artistSetId);
  },
  {
    visibilityTimeoutSeconds: 60,
    retry: (_error, metadata) => {
      if (metadata.deliveryCount > 8) return { acknowledge: true };
      return { afterSeconds: Math.min(300, 2 ** metadata.deliveryCount * 5) };
    },
  },
);
