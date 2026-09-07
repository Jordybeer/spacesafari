import { handleCallback } from "@vercel/queue";
import { deliverPingNotification } from "@/src/lib/notification-delivery";
import { DEFAULT_FESTIVAL_ID } from "@/src/lib/festivals";
import { enqueuePingReminder, secondsUntil, type PingReminderMessage } from "@/src/lib/ping-queue";
import { getPing } from "@/src/lib/pings";

export const POST = handleCallback(
  async (message: PingReminderMessage) => {
    const festivalId = message.festivalId ?? DEFAULT_FESTIVAL_ID;
    const ping = await getPing(message.chatId, message.artistSetId, festivalId);

    // Deleted, already delivered, or superseded reminders are safe no-ops.
    if (!ping || ping.sentAt || ping.createdAt !== message.createdAt) return;

    // Hop forward durably when the target is farther away than one queue delay.
    if (secondsUntil(ping.notifyAt) > 2) {
      await enqueuePingReminder({
        chatId: ping.chatId,
        artistSetId: ping.artistSetId,
        festivalId,
        createdAt: ping.createdAt,
        notifyAt: ping.notifyAt,
        hop: message.hop + 1,
      });
      return;
    }

    await deliverPingNotification(message.chatId, message.artistSetId, undefined, festivalId);
  },
  {
    visibilityTimeoutSeconds: 60,
    retry: (_error, metadata) => {
      if (metadata.deliveryCount > 8) return { acknowledge: true };
      return { afterSeconds: Math.min(300, 2 ** metadata.deliveryCount * 5) };
    },
  },
);
