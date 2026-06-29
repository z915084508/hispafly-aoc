import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Keep production builds separate from the active development server output.
  distDir: ".next-aoc",
};

export default nextConfig;
