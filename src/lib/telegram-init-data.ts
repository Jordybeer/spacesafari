import crypto from "node:crypto";
import { requireEnv } from "./env";
import type { TelegramUser } from "./telegram";

export interface ValidatedMiniAppData {
  user: TelegramUser;
  chatInstance?: string;
  chatType?: string;
  startParam?: string;
  authDate: number;
}

function timingSafeHexEqual(a: string, b: string): boolean {
  if (!/^[0-9a-f]+$/i.test(a) || !/^[0-9a-f]+$/i.test(b) || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

export function validateTelegramInitData(
  initData: string,
  maxAgeSeconds = 24 * 60 * 60,
): ValidatedMiniAppData {
  if (!initData) throw new Error("Missing Telegram initData");

  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash");
  if (!receivedHash) throw new Error("Telegram initData hash is missing");

  params.delete("hash");
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(requireEnv("TELEGRAM_BOT_TOKEN"))
    .digest();

  const calculatedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  if (!timingSafeHexEqual(receivedHash, calculatedHash)) {
    throw new Error("Invalid Telegram initData signature");
  }

  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate)) throw new Error("Invalid Telegram auth_date");
  const now = Math.floor(Date.now() / 1000);
  if (authDate > now + 30 || now - authDate > maxAgeSeconds) {
    throw new Error("Expired Telegram initData");
  }

  const userRaw = params.get("user");
  if (!userRaw) throw new Error("Telegram user is missing");
  const user = JSON.parse(userRaw) as TelegramUser;
  if (!user.id || !user.first_name) throw new Error("Invalid Telegram user");

  return {
    user,
    chatInstance: params.get("chat_instance") ?? undefined,
    chatType: params.get("chat_type") ?? undefined,
    startParam: params.get("start_param") ?? undefined,
    authDate,
  };
}
