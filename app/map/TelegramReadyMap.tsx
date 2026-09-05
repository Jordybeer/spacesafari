"use client";

import { useEffect, useState } from "react";
import MapClientV2 from "./MapClientV2";

type TelegramWindow = Window & {
  Telegram?: {
    WebApp?: {
      initData?: string;
      ready?: () => void;
    };
  };
};

const MAX_WAIT_MS = 2_500;
const RETRY_MS = 40;

export default function TelegramReadyMap() {
  const [mountMap, setMountMap] = useState(false);

  useEffect(() => {
    const startedAt = Date.now();
    let timer: number | undefined;

    const probe = () => {
      const webApp = (window as TelegramWindow).Telegram?.WebApp;
      webApp?.ready?.();

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
      <main style={{ minHeight: "100svh", display: "grid", placeItems: "center", padding: 24 }}>
        <div style={{ color: "rgba(248,232,209,.68)", fontSize: 12, letterSpacing: ".08em" }}>
          SPACE SAFARI · laden…
        </div>
      </main>
    );
  }

  return <MapClientV2 />;
}
