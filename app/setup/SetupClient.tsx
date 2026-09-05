"use client";

import { useState } from "react";

type Readiness = {
  telegram: boolean;
  redis: boolean;
  qstash: boolean;
  mapAdmin: boolean;
};

type ReadinessRow = {
  label: string;
  ready: boolean;
  missing: string;
  href?: string;
  action?: string;
};

export default function SetupClient({ readiness }: { readiness: Readiness }) {
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function register() {
    if (!secret.trim()) return;
    setBusy(true);
    setMessage(null);
    setOk(false);
    try {
      const response = await fetch("/api/telegram/register-webhook", {
        method: "POST",
        headers: { authorization: `Bearer ${secret.trim()}` },
        cache: "no-store",
      });
      const payload = await response.json() as {
        ok?: boolean;
        error?: string;
        webhookUrl?: string;
        webhookInfo?: { url?: string; pending_update_count?: number; last_error_message?: string };
      };
      if (!response.ok || !payload.ok) throw new Error(payload.error || `HTTP ${response.status}`);
      setOk(true);
      setSecret("");
      const pending = payload.webhookInfo?.pending_update_count ?? 0;
      const lastError = payload.webhookInfo?.last_error_message;
      setMessage(
        `Webhook actief op ${payload.webhookUrl}. ${pending} pending update${pending === 1 ? "" : "s"}.` +
        (lastError ? ` Telegram meldt nog: ${lastError}` : ""),
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Webhook registreren mislukte.");
    } finally {
      setBusy(false);
    }
  }

  const rows: ReadinessRow[] = [
    { label: "Telegram bot", ready: readiness.telegram, missing: "token + username + webhook secret" },
    {
      label: "Live map & opslag",
      ready: readiness.redis,
      missing: "Upstash Redis",
      href: "https://vercel.com/marketplace/upstash/upstash-kv",
      action: "Koppel Redis in Vercel",
    },
    {
      label: "15-minuten pings",
      ready: readiness.redis && readiness.qstash,
      missing: readiness.redis ? "Upstash QStash" : "Redis + QStash",
      href: "https://vercel.com/marketplace/upstash/upstash-qstash",
      action: "Koppel QStash in Vercel",
    },
    { label: "GPS-kalibratie admin", ready: readiness.mapAdmin, missing: "Telegram user ID allowlist" },
  ];

  return (
    <main className="landing-shell">
      <section className="festival-card landing-card">
        <div className="eyebrow">BOT SETUP</div>
        <div className="wordmark">SPACE<br />SAFARI</div>
        <p className="lede">Runtime readiness</p>
        <div style={{ display: "grid", gap: 8, width: "100%", marginBottom: 18 }}>
          {rows.map((row) => (
            <div key={row.label} className={`notice ${row.ready ? "" : "error-notice"}`} style={{ margin: 0, textAlign: "left" }}>
              <strong>{row.ready ? "✅" : "⏳"} {row.label}</strong><br />
              <span className="microcopy">{row.ready ? "klaar" : `nog nodig: ${row.missing}`}</span>
              {!row.ready && row.href && (
                <>
                  <br />
                  <a className="small-button" href={row.href} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 8 }}>
                    {row.action} ↗
                  </a>
                </>
              )}
            </div>
          ))}
        </div>
        {(!readiness.redis || !readiness.qstash) && (
          <p className="microcopy">
            Kies in Vercel bij de Marketplace-installatie het project <strong>spacesafari</strong>. De integraties zetten hun environment variables automatisch; deze pagina toont de nieuwe status na de redeploy.
          </p>
        )}

        <p className="lede">Telegram webhook activeren</p>
        <p className="microcopy">
          Plak hier dezelfde waarde die in Vercel staat als TELEGRAM_WEBHOOK_SECRET.
          De waarde wordt alleen naar deze server gestuurd en niet opgeslagen in je browser.
        </p>
        <input
          className="text-input"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="Webhook secret"
          value={secret}
          onChange={(event) => setSecret(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") void register(); }}
        />
        <button className="primary-button" type="button" disabled={busy || !secret.trim() || !readiness.telegram} onClick={() => void register()}>
          {busy ? "Verbinden…" : "🔗 Activeer Telegram webhook"}
        </button>
        {!readiness.telegram && <div className="notice error-notice">Telegram-configuratie is nog niet compleet in Vercel.</div>}
        {message && <div className={`notice ${ok ? "" : "error-notice"}`}>{ok ? "✅ " : "⚠️ "}{message}</div>}
      </section>
    </main>
  );
}
