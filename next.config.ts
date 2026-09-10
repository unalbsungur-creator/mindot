import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Allows the dev server (HMR/RSC/dev-only assets) to accept requests from
  // this LAN origin when testing on a real phone at 192.168.1.15:3200.
  // Dev-only; does not affect production.
  allowedDevOrigins: ["192.168.1.15"],
};

export default nextConfig;
