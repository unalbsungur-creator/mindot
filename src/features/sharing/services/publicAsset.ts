import { readFileSync } from "node:fs";
import path from "node:path";
import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Reads a file from this app's own `public/` directory at request time.
 * Cloudflare Workers (the production runtime, via OpenNext) have no real
 * filesystem — `readFileSync` throws there even though `public/` files are
 * genuinely served by the Worker's own `ASSETS` binding, which is what this
 * reads from instead whenever a Cloudflare request context is present.
 * `getCloudflareContext()` throws outside one — plain `next dev`, or a tsx
 * script run directly under Node — and that's exactly when the local
 * filesystem (still real there) is the right, simpler thing to read from.
 * Same try/catch-and-fall-back-to-DATABASE_URL shape as `src/lib/db/client.ts`'s
 * `resolveConnection()`.
 */
export async function readPublicAsset(pathname: string): Promise<ArrayBuffer> {
  let assets: { fetch(request: Request): Promise<Response> } | undefined;
  try {
    assets = getCloudflareContext().env.ASSETS;
  } catch {
    // Not running inside a Cloudflare Worker request — fall through to the filesystem.
  }
  if (assets) {
    const response = await assets.fetch(new Request(new URL(pathname, "https://assets.internal")));
    if (!response.ok) {
      throw new Error(`ASSETS binding returned ${response.status} for ${pathname}`);
    }
    return response.arrayBuffer();
  }
  const buffer = readFileSync(path.join(process.cwd(), "public", pathname));
  return Uint8Array.from(buffer).buffer;
}
