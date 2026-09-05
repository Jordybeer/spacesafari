"use client";

import { useState } from "react";

export default function SetupClient() {
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

  return (
    <main className="landing-shell">
      <section className="festival-card landing-card">
        <div className="eyebrow">BOT SETUP</div>
        <div className="wordmark">SPACE<br />SAFARI</div>
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
        <button className="primary-button" type="button" disabled={busy || !secret.trim()} onClick={() => void register()}>
          {busy ? "Verbinden…" : "🔗 Activeer Telegram webhook"}
        </button>
        {message && <div className={`notice ${ok ? "" : "error-notice"}`}>{ok ? "✅ " : "⚠️ "}{message}</div>}
      </section>
    </main>
  );
}
