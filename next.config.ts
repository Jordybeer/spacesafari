import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {},
  async rewrites() {
    return [
      {
        source: "/festival-map.jpg",
        destination: "/festival-map-original.png",
      },
      {
        source: "/festival-terrain-overlay.webp",
        destination: "/festival-map-original.png",
      },
    ];
  },
};

export default nextConfig;
