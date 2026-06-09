import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "pub-5f4d009f85fb4ef88522b805d8312f4e.r2.dev",
      },
    ],
  },
};

export default nextConfig;
