import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ginder",
    short_name: "Ginder",
    description: "Festivalkaart, timetable en opt-in live groepslocaties",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#251225",
    theme_color: "#251225",
    icons: [
      { src: "/ginder-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/ginder-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/ginder-icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
