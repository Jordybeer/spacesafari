import type { Metadata } from "next";
import { isRedisConfigured } from "@/src/lib/storage";
import { hasMapAdminConfiguration } from "@/src/lib/map-model";
import SetupClient from "./SetupClient";

export const metadata: Metadata = {
  title: "Telegram setup · Space Safari",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type WebhookInfo = {
  url?: string;
  pending_update_count?: number;
};

async function getWebhookReadiness(): Promise<{ active: boolean; pending: number | null }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { active: false, pending: null };

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`, { cache: "no-store" });
    const payload = await response.json() as { ok?: boolean; result?: WebhookInfo };
    if (!response.ok || !payload.ok || !payload.result) return { active: false, pending: null };

    const appUrl = (process.env.APP_URL || "https://spacesafari.jordy.beer").replace(/\/$/, "");
    return {
      active: payload.result.url === `${appUrl}/api/telegram/webhook`,
      pending: payload.result.pending_update_count ?? 0,
    };
  } catch {
    return { active: false, pending: null };
  }
}

export default async function SetupPage() {
  const webhook = await getWebhookReadiness();
  const redis = isRedisConfigured();
  const readiness = {
    telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_USERNAME && process.env.TELEGRAM_WEBHOOK_SECRET),
    webhookActive: webhook.active,
    webhookPending: webhook.pending,
    redis,
    reminders: redis,
    mapAdmin: hasMapAdminConfiguration(),
  };

  return <SetupClient readiness={readiness} />;
}
