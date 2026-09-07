import type { ReactNode } from "react";

export default function MapLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <style>{`
        [aria-label="GPS-uitgelijnde Space Safari festivalkaart"] {
          isolation: isolate;
          overflow: hidden;
          background: #211120;
        }

        [aria-label="GPS-uitgelijnde Space Safari festivalkaart"]::before {
          content: "";
          position: absolute;
          inset: -28px;
          z-index: 0;
          pointer-events: none;
          background: #211120 url('/festival-map-original.png?v=1') center / cover no-repeat;
          filter: blur(18px) saturate(.82) brightness(.58);
          transform: scale(1.08);
          transform-origin: center;
          opacity: .92;
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
      `}</style>
      {children}
    </>
  );
}
