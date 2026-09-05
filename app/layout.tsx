import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Space Safari Assistant",
  description: "Unofficial community companion for Space Safari 2026",
  applicationName: "Space Safari Assistant",
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
      <head>
        {/* Telegram recommends loading this in <head> before application scripts. */}
        <script src="https://telegram.org/js/telegram-web-app.js?63" />
      </head>
      <body>{children}</body>
    </html>
  );
}
