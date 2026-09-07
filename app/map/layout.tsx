import type { ReactNode } from "react";

export default function MapLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <style>{`
        /* Keep calibrated festival artwork untouched. Empty map space uses the
           artwork edge tone instead of a blurred/cropped duplicate. */
        div:has(> [aria-label$="festivalkaart" i]) {
          position: relative;
          isolation: isolate;
          overflow: hidden;
          background: #251225;
        }

        [aria-label$="festivalkaart" i] {
          z-index: 1;
          isolation: isolate;
          overflow: hidden;
          background: #251225 !important;
        }

        [aria-label$="festivalkaart" i] .maplibregl-canvas,
        [aria-label$="festivalkaart" i] .maplibregl-canvas-container {
          background: transparent !important;
        }

        [aria-label$="festivalkaart" i] .maplibregl-canvas {
          opacity: 0;
        }

        [aria-label$="festivalkaart" i] > img {
          z-index: 1 !important;
        }

        [aria-label$="festivalkaart" i] .maplibregl-marker,
        [aria-label$="festivalkaart" i] .maplibregl-control-container {
          z-index: 3;
        }

        [data-map-special="meet"] {
          animation: ginderMeetAttention 1.9s ease-in-out infinite;
        }

        @keyframes ginderMeetAttention {
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
