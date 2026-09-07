import crypto from "node:crypto";
import { optionalEnv, requireEnv } from "./env";
import { timingSafeSecretEqual } from "./webhook-security";

const ROOM_TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;
const TOKEN_NONCE_BYTES = 12;
const TOKEN_TAG_BYTES = 12;

export type WhatsAppGroupTextMessage = {
  groupId: string;
  messageId: string;
  from: string;
  text: string;
};

function roomSecret(): string | undefined {
  return optionalEnv("MAP_ROOM_SECRET") || optionalEnv("TELEGRAM_WEBHOOK_SECRET");
}

function inviteTag(secret: string, nonce: Buffer): Buffer {
  return crypto
    .createHmac("sha256", secret)
    .update("spacesafari:whatsapp-invite:v1:")
    .update(nonce)
    .digest()
    .subarray(0, TOKEN_TAG_BYTES);
}

/**
 * Produces a deterministic, opaque, self-verifying token for a WhatsApp group.
 * The group id cannot be recovered from the token and is never persisted.
 */
export function whatsappRoomToken(groupId: string): string {
  const secret = roomSecret();
  if (!secret) throw new Error("MAP_ROOM_SECRET or TELEGRAM_WEBHOOK_SECRET is not configured");
  const nonce = crypto
    .createHmac("sha256", secret)
    .update("spacesafari:whatsapp-room:v1:")
    .update(groupId)
    .digest()
    .subarray(0, TOKEN_NONCE_BYTES);
  return Buffer.concat([nonce, inviteTag(secret, nonce)]).toString("base64url");
}

export function verifyWhatsAppRoomToken(token: string): boolean {
  const secret = roomSecret();
  if (!secret || !ROOM_TOKEN_RE.test(token)) return false;
  let decoded: Buffer;
  try {
    decoded = Buffer.from(token, "base64url");
  } catch {
    return false;
  }
  if (decoded.length !== TOKEN_NONCE_BYTES + TOKEN_TAG_BYTES) return false;
  const nonce = decoded.subarray(0, TOKEN_NONCE_BYTES);
  const receivedTag = decoded.subarray(TOKEN_NONCE_BYTES);
  const expectedTag = inviteTag(secret, nonce);
  return receivedTag.length === expectedTag.length && crypto.timingSafeEqual(receivedTag, expectedTag);
}

export function verifyWhatsAppWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret = optionalEnv("WHATSAPP_APP_SECRET"),
): boolean {
  if (!appSecret || !signatureHeader?.startsWith("sha256=")) return false;
  const expected = `sha256=${crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
  return timingSafeSecretEqual(signatureHeader, expected);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function extractWhatsAppGroupTextMessages(payload: unknown): WhatsAppGroupTextMessage[] {
  const root = asRecord(payload);
  if (!root || root.object !== "whatsapp_business_account" || !Array.isArray(root.entry)) return [];
  const result: WhatsAppGroupTextMessage[] = [];

  for (const entryValue of root.entry) {
    const entry = asRecord(entryValue);
    if (!entry || !Array.isArray(entry.changes)) continue;
    for (const changeValue of entry.changes) {
      const change = asRecord(changeValue);
      const value = asRecord(change?.value);
      if (!change || change.field !== "messages" || !value || !Array.isArray(value.messages)) continue;
      for (const messageValue of value.messages) {
        const message = asRecord(messageValue);
        const text = asRecord(message?.text);
        if (
          !message ||
          message.type !== "text" ||
          typeof message.group_id !== "string" ||
          typeof message.id !== "string" ||
          typeof message.from !== "string" ||
          !text ||
          typeof text.body !== "string"
        ) continue;
        result.push({
          groupId: message.group_id,
          messageId: message.id,
          from: message.from,
          text: text.body,
        });
      }
    }
  }

  return result;
}

export function isWhatsAppMapCommand(text: string): boolean {
  return /^\/?(?:map|kaart)\s*$/i.test(text.trim());
}

export function whatsappMapLink(groupId: string): string {
  const appUrl = requireEnv("APP_URL").replace(/\/$/, "");
  return `${appUrl}/w/${whatsappRoomToken(groupId)}`;
}

function whatsappGraphVersion(): string {
  const value = requireEnv("WHATSAPP_GRAPH_VERSION");
  if (!/^v\d+\.\d+$/.test(value)) throw new Error("WHATSAPP_GRAPH_VERSION must look like v23.0");
  return value;
}

export async function sendWhatsAppGroupText(groupId: string, text: string): Promise<void> {
  const response = await fetch(
    `https://graph.facebook.com/${whatsappGraphVersion()}/${encodeURIComponent(requireEnv("WHATSAPP_PHONE_NUMBER_ID"))}/messages`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${requireEnv("WHATSAPP_ACCESS_TOKEN")}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "group",
        to: groupId,
        type: "text",
        text: { body: text },
      }),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`WhatsApp send failed (${response.status})${detail ? `: ${detail.slice(0, 300)}` : ""}`);
  }
}
