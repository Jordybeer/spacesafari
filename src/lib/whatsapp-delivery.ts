import crypto from "node:crypto";
import { getRedis } from "./storage";

const COMPLETED_TTL_SECONDS = 7 * 24 * 60 * 60;
const CLAIM_TTL_SECONDS = 60;

export type WhatsAppDeliveryClaim = "claimed" | "complete" | "busy";

function deliveryKey(kind: "done" | "claim", messageId: string): string {
  const digest = crypto.createHash("sha256").update(messageId).digest("base64url");
  return `ss:whatsapp:${kind}:${digest}`;
}

/**
 * Claims a webhook message before its outbound reply is attempted.
 * Completed messages are skipped across Meta retries. A short-lived claim
 * prevents concurrent retries from sending the same reply twice.
 */
export async function claimWhatsAppDelivery(messageId: string): Promise<WhatsAppDeliveryClaim> {
  const redis = getRedis();
  const doneKey = deliveryKey("done", messageId);
  const claimKey = deliveryKey("claim", messageId);

  if (await redis.exists(doneKey)) return "complete";

  const claimed = await redis.set(claimKey, "1", { nx: true, ex: CLAIM_TTL_SECONDS });
  if (claimed !== "OK") {
    if (await redis.exists(doneKey)) return "complete";
    return "busy";
  }

  // Close the small race where another worker completed between our initial
  // done check and acquisition of a claim after its own claim expired.
  if (await redis.exists(doneKey)) {
    await redis.del(claimKey);
    return "complete";
  }

  return "claimed";
}

/** Mark complete only after the WhatsApp send succeeds. */
export async function completeWhatsAppDelivery(messageId: string): Promise<void> {
  const redis = getRedis();
  const doneKey = deliveryKey("done", messageId);
  const claimKey = deliveryKey("claim", messageId);

  await redis.set(doneKey, "1", { ex: COMPLETED_TTL_SECONDS });
  await redis.del(claimKey);
}

/** Release a failed attempt so Meta can retry it immediately. */
export async function releaseWhatsAppDelivery(messageId: string): Promise<void> {
  await getRedis().del(deliveryKey("claim", messageId));
}
