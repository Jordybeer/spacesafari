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
  icons: { icon: "/festival-map.jpg" },
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
