import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {},
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/festival-map.jpg",
          destination: "/festival-map-hq.jpg",
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
