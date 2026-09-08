import { NextResponse } from "next/server";
import { requireEnv } from "@/src/lib/env";
import { syncTelegramCommandUi } from "@/src/lib/telegram-command-ui";
import { timingSafeSecretEqual } from "@/src/lib/webhook-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function telegram(method: string, body: Record<string, unknown> = {}) {
  const token = requireEnv("TELEGRAM_BOT_TOKEN");
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const payload = (await response.json()) as { ok: boolean; description?: string; result?: unknown };
  if (!payload.ok) throw new Error(payload.description ?? `Telegram ${method} failed`);
  return payload.result;
}

export async function POST(request: Request) {
  const configuredSecret = process.env.WEBHOOK_ADMIN_SECRET || process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!configuredSecret) {
    return NextResponse.json({ error: "TELEGRAM_WEBHOOK_SECRET is not configured" }, { status: 503 });
  }

  const auth = request.headers.get("authorization") ?? "";
  const supplied = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!timingSafeSecretEqual(supplied, configuredSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const appUrl = requireEnv("APP_URL").replace(/\/$/, "");
    const webhookUrl = `${appUrl}/api/telegram/webhook`;
    await telegram("setWebhook", {
      url: webhookUrl,
      secret_token: requireEnv("TELEGRAM_WEBHOOK_SECRET"),
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: false,
    });
    await syncTelegramCommandUi(true);
    const webhookInfo = await telegram("getWebhookInfo");
    return NextResponse.json({ ok: true, webhookUrl, webhookInfo });
  } catch (error) {
    console.error("Webhook registration failed", error);
    return NextResponse.json({ ok: false, error: "Registration failed" }, { status: 500 });
  }
}