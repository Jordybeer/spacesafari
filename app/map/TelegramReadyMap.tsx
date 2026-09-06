"use client";

import { useEffect, useState } from "react";
import MapClientV3 from "./MapClientV3";

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
  const [showFestivalMap, setShowFestivalMap] = useState(false);

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

  useEffect(() => {
    if (!showFestivalMap) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowFestivalMap(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [showFestivalMap]);

  if (!mountMap) {
    return (
      <main style={{ minHeight: "100svh", display: "grid", placeItems: "center", padding: 24 }}>
        <div style={{ color: "rgba(248,232,209,.68)", fontSize: 12, letterSpacing: ".08em" }}>
          SPACE SAFARI · laden…
        </div>
      </main>
    );
  }

  return (
    <>
      <MapClientV3 />

      <button
        type="button"
        onClick={() => setShowFestivalMap(true)}
        aria-haspopup="dialog"
        aria-expanded={showFestivalMap}
        style={{
          position: "fixed",
          right: 12,
          bottom: "calc(126px + var(--tg-safe-bottom, 0px))",
          zIndex: 40,
          minHeight: 40,
          padding: "0 13px",
          border: "1px solid rgba(248,232,209,.22)",
          borderRadius: 999,
          background: "rgba(40,18,35,.95)",
          color: "#f8e8d1",
          boxShadow: "0 10px 28px rgba(0,0,0,.38)",
          backdropFilter: "blur(14px)",
          font: "inherit",
          fontSize: 11,
          fontWeight: 900,
          cursor: "pointer",
        }}
      >
        🗺️ Festivalkaart
      </button>

      {showFestivalMap && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Space Safari festivalkaart"
          onClick={() => setShowFestivalMap(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            display: "grid",
            placeItems: "center",
            padding: "calc(12px + var(--tg-safe-top, 0px)) 12px calc(12px + var(--tg-safe-bottom, 0px))",
            background: "rgba(18,8,17,.88)",
            backdropFilter: "blur(12px)",
          }}
        >
          <section
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "min(100%, 620px)",
              maxHeight: "100%",
              display: "grid",
              gridTemplateRows: "auto minmax(0, 1fr)",
              overflow: "hidden",
              border: "1px solid rgba(218,142,184,.38)",
              borderRadius: 18,
              background: "#211120",
              boxShadow: "0 24px 70px rgba(0,0,0,.55)",
            }}
          >
            <header
              style={{
                minHeight: 50,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: "8px 10px 8px 14px",
                borderBottom: "1px solid rgba(248,232,209,.12)",
                color: "#f8e8d1",
              }}
            >
              <div style={{ display: "grid", gap: 2 }}>
                <strong style={{ fontSize: 13 }}>Space Safari festivalkaart</strong>
                <span style={{ color: "rgba(248,232,209,.62)", fontSize: 9 }}>Statisch · altijd beschikbaar, ook zonder GPS-kalibratie</span>
              </div>
              <button
                type="button"
                onClick={() => setShowFestivalMap(false)}
                aria-label="Sluit festivalkaart"
                style={{
                  width: 36,
                  height: 36,
                  flex: "0 0 36px",
                  border: "1px solid rgba(248,232,209,.16)",
                  borderRadius: 11,
                  background: "rgba(255,255,255,.06)",
                  color: "#f8e8d1",
                  fontSize: 20,
                  lineHeight: 1,
                  cursor: "pointer",
                }}
              >
                ×
              </button>
            </header>

            <div style={{ minHeight: 0, overflow: "auto", overscrollBehavior: "contain", background: "#251225" }}>
              <img
                src="/festival-terrain-overlay.webp?v=2"
                alt="Space Safari 2026 festivalterrein met stages, paden en camping"
                draggable={false}
                style={{ display: "block", width: "100%", height: "auto", userSelect: "none" }}
              />
            </div>
          </section>
        </div>
      )}
    </>
  );
}
