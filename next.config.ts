import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Allows the dev server (HMR/RSC/dev-only assets) to accept requests from
  // these origins when testing on a real phone: the plain LAN IP
  // (192.168.1.15:3200) and the Cloudflare Tunnel hostname
  // (dev.mind-ot.com) fronting the same local dev server, needed because
  // Google OAuth rejects private-IP redirect URIs — see EPIC 034. Dev-only;
  // does not affect production.
  allowedDevOrigins: ["192.168.1.15", "dev.mind-ot.com"],
};

export default nextConfig;
