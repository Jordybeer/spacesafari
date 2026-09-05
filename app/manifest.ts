import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Space Safari Assistant",
    short_name: "Space Safari",
    description: "Festival timetable and opt-in live map companion",
    start_url: "/map",
    scope: "/",
    display: "standalone",
    background_color: "#251225",
    theme_color: "#251225",
    icons: [
      { src: "/festival-map.jpg", sizes: "640x800", type: "image/jpeg", purpose: "any" },
    ],
  };
}
