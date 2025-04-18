import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [new URL('https://res.cloudinary.com/dtecpsig5/image/upload/v1744922987/post-punk/**')],
  },
};

export default nextConfig;
