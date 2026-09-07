import type { ReactNode } from "react";

export default function MapLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <style>{`
        /* Put the visual extension on the real map wrapper, outside MapLibre.
           The calibrated artwork itself stays untouched and fully visible. */
        div:has(> [aria-label="GPS-uitgelijnde Space Safari festivalkaart"]) {
          position: relative;
          isolation: isolate;
          overflow: hidden;
          background: #211120;
        }

        div:has(> [aria-label="GPS-uitgelijnde Space Safari festivalkaart"])::before {
          content: "";
          position: absolute;
          inset: -64px;
          z-index: 0;
          pointer-events: none;
          background:
            linear-gradient(rgba(33, 17, 32, .18), rgba(33, 17, 32, .18)),
            url('/festival-map-original.png?v=2') center / cover no-repeat;
          filter: blur(14px) saturate(.9) brightness(.96);
          transform: scale(1.18);
          transform-origin: center;
          opacity: 1;
        }

        [aria-label="GPS-uitgelijnde Space Safari festivalkaart"] {
          z-index: 1;
          isolation: isolate;
          overflow: hidden;
          background: transparent !important;
        }

        [aria-label="GPS-uitgelijnde Space Safari festivalkaart"] .maplibregl-canvas,
        [aria-label="GPS-uitgelijnde Space Safari festivalkaart"] .maplibregl-canvas-container {
          background: transparent !important;
        }

        [aria-label="GPS-uitgelijnde Space Safari festivalkaart"] .maplibregl-canvas {
          opacity: 0;
        }

        [aria-label="GPS-uitgelijnde Space Safari festivalkaart"] > img {
          z-index: 1 !important;
        }

        [aria-label="GPS-uitgelijnde Space Safari festivalkaart"] .maplibregl-marker,
        [aria-label="GPS-uitgelijnde Space Safari festivalkaart"] .maplibregl-control-container {
          z-index: 3;
        }

        /* Browser login is a different dock than the live-sharing controls.
           Keep it one full-width column so Safari never crushes the copy. */
        [aria-label="Telegram login"] {
          grid-template-columns: minmax(0, 1fr) !important;
        }

        [aria-label="Telegram login"] > * {
          grid-column: 1 / -1 !important;
          min-width: 0;
        }
      `}</style>
      {children}
    </>
  );
}
