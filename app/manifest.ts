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
      { src: "/festival-map.jpg", sizes: "640x800", type: "image/jpeg", purpose: "any" },
    ],
  };
}
