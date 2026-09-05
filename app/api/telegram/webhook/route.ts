import { NextResponse } from "next/server";
import { routeTelegramUpdate } from "@/src/lib/bot-router";
import type { TelegramUpdate } from "@/src/lib/telegram";
import { timingSafeSecretEqual } from "@/src/lib/webhook-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected) {
    console.error("TELEGRAM_WEBHOOK_SECRET is not configured");
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  const received = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!timingSafeSecretEqual(received, expected)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  try {
    await routeTelegramUpdate(update);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Telegram update failed", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
