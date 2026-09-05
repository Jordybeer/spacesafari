"use client";

import { useEffect, useState } from "react";
import MapClient from "./MapClient";

type TelegramWindow = Window & {
  Telegram?: {
    WebApp?: {
      initData?: string;
      ready?: () => void;
    };
  };
};

const MAX_WAIT_MS = 5_000;
const RETRY_MS = 50;

export default function TelegramReadyMap() {
  const [mountMap, setMountMap] = useState(false);

  useEffect(() => {
    const startedAt = Date.now();
    let timer: number | undefined;

    const probe = () => {
      const webApp = (window as TelegramWindow).Telegram?.WebApp;
      webApp?.ready?.();

      // Mount as soon as Telegram has delivered signed initData. This avoids a
      // hydration race on iOS where our React effect could run before the
      // telegram-web-app bridge finished initializing.
      if (webApp?.initData || Date.now() - startedAt >= MAX_WAIT_MS) {
        setMountMap(true);
        return;
      }

      timer = window.setTimeout(probe, RETRY_MS);
    };

    probe();
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, []);

  if (!mountMap) {
    return (
      <main className="landing-shell">
        <section className="festival-card landing-card">
          <div className="eyebrow">TELEGRAM MINI APP</div>
          <div className="wordmark">SPACE<br />SAFARI</div>
          <p className="lede">Telegram-identiteit laden…</p>
        </section>
      </main>
    );
  }

  return <MapClient />;
}
