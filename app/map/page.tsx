import Script from "next/script";
import MapClient from "./MapClient";

export default function MapPage() {
  return (
    <>
      <Script src="https://telegram.org/js/telegram-web-app.js?63" strategy="beforeInteractive" />
      <MapClient />
    </>
  );
}
