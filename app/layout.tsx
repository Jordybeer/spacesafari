import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";
import "./telegram-viewport.css";

export const metadata: Metadata = {
  title: "Ginder",
  description: "Festivalkaart, timetable en opt-in live groepslocaties.",
  applicationName: "Ginder",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/ginder-icon.svg", type: "image/svg+xml" },
      { url: "/ginder-icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/ginder-icon-180.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#251225",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="nl">
      <body>
        <Script src="https://telegram.org/js/telegram-web-app.js?63" strategy="beforeInteractive" />
        {children}
      </body>
    </html>
  );
}
