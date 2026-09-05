import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { validateTelegramInitData } from "@/src/lib/telegram-init-data";

function sign(params: Record<string, string>, token: string) {
  const data = new URLSearchParams(params);
  const check = [...data.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(token).digest();
  const hash = crypto.createHmac("sha256", secret).update(check).digest("hex");
  data.set("hash", hash);
  return data.toString();
}

describe("Telegram Mini App initData validation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-05T10:00:00Z"));
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
  });
  afterEach(() => vi.useRealTimers());

  it("accepts a valid signed user and chat context", () => {
    const authDate = Math.floor(Date.now() / 1000).toString();
    const initData = sign({
      auth_date: authDate,
      chat_instance: "1234567890123456789",
      chat_type: "group",
      start_param: "map",
      user: JSON.stringify({ id: 42, first_name: "Bear", username: "littlebear" }),
    }, "test-token");
    const result = validateTelegramInitData(initData);
    expect(result.user.id).toBe(42);
    expect(result.chatInstance).toBe("1234567890123456789");
  });

  it("rejects tampering", () => {
    const authDate = Math.floor(Date.now() / 1000).toString();
    const valid = sign({ auth_date: authDate, user: JSON.stringify({ id: 42, first_name: "Bear" }) }, "test-token");
    expect(() => validateTelegramInitData(valid.replace("Bear", "Fox"))).toThrow(/signature/i);
  });

  it("rejects expired data", () => {
    const old = Math.floor(Date.now() / 1000 - 25 * 60 * 60).toString();
    const initData = sign({ auth_date: old, user: JSON.stringify({ id: 42, first_name: "Bear" }) }, "test-token");
    expect(() => validateTelegramInitData(initData)).toThrow(/expired/i);
  });
});
