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
  // P0 hotfix #3 (PDF Worker Yoga WASM): without this, Turbopack inlines
  // yoga-layout's Emscripten WASM loader directly into `.next/server/
  // chunks/*.js` for at least one of its two call sites (confirmed
  // directly: @react-pdf/layout's own SVG-resolution code path,
  // triggered by noteCardPdf.tsx/brandMarkPdf.tsx's <Svg>/<Path>/
  // <Circle> usage, ends up baked into a shared server chunk as a
  // *second*, un-configurable Emscripten instance — distinct from the
  // one `yoga-layout/load`'s own direct import resolves to). OpenNext's
  // post-build patch (see @opennextjs/cloudflare's patch-yoga-layout.js)
  // can only patch real `node_modules/yoga-layout` files on disk after
  // `next build` finishes; it has no way to reach into an already-
  // inlined Turbopack chunk. Marking yoga-layout external keeps every
  // consumer's import as a real `node_modules` reference instead
  // (`@react-pdf/renderer` is already in Next's own default
  // serverExternalPackages list, but that opt-out is not transitive —
  // confirmed directly: yoga-layout, two dependency levels below it,
  // still got inlined without this explicit entry of its own).
  serverExternalPackages: ["yoga-layout"],
};

export default nextConfig;
