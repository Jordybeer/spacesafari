import type { ReactNode } from "react";

export default function MapLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <style>{`
        /* Keep the calibrated artwork untouched. Empty map space uses the
           artwork edge tone instead of a blurred/cropped duplicate. */
        div:has(> [aria-label="GPS-uitgelijnde Space Safari festivalkaart"]) {
          position: relative;
          isolation: isolate;
          overflow: hidden;
          background: #251225;
        }

        [aria-label="GPS-uitgelijnde Space Safari festivalkaart"] {
          z-index: 1;
          isolation: isolate;
          overflow: hidden;
          background: #251225 !important;
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

        [data-map-special="meet"] {
          animation: ssMeetAttention 1.9s ease-in-out infinite;
        }

        @keyframes ssMeetAttention {
          50% { filter: drop-shadow(0 0 9px rgba(243, 107, 23, .62)); }
        }

        @media (prefers-reduced-motion: reduce) {
          [data-map-special="meet"] { animation: none; }
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
