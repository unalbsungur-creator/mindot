import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Security review 2026-11-13 (Aşama 2a/3): public share and OG PNGs used to
 * be re-rendered on every request (3–6 s of Worker CPU each, no edge
 * caching — a Worker response is not cached by Cloudflare unless the Worker
 * puts it there), so anyone could burn CPU by repeating a request.
 *
 * Key = SHA-256 of the route name, the renderer's *entire* input, and the
 * deployed Worker version. Each request still does its cheap database read
 * (so an unapproved/deleted note still 404s at once); only the expensive
 * render is reused. Any change that alters the image — an approved revision,
 * a different author name or photo, a newly approved wall card, a renderer
 * change shipped in a new deploy — changes the input or the version, so it
 * is a different key: an outdated image is never served from this cache.
 *
 * Browsers and shared caches get a short window plus an ETag (the same
 * hash), so a revisit revalidates cheaply with a 304 instead of re-sending
 * the PNG. Outside Workers (dev, tests) the cache is simply skipped.
 */

export const RENDER_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;
export const SHARE_IMAGE_BROWSER_CACHE_CONTROL = "public, max-age=60, must-revalidate";
/** A render that sets this header (e.g. a degraded fallback image) is served but never stored. */
export const RENDER_NO_STORE_HEADER = "X-Render-No-Store";

interface EdgeCache {
  match(key: Request): Promise<Response | undefined>;
  put(key: Request, response: Response): Promise<void>;
}

export interface RenderCacheDeps {
  cache: EdgeCache | null;
  deploymentId: string;
  waitUntil?: (promise: Promise<unknown>) => void;
}

function defaultDeps(): RenderCacheDeps {
  const cache = (globalThis as { caches?: { default?: EdgeCache } }).caches?.default ?? null;
  let deploymentId = "local";
  let waitUntil: RenderCacheDeps["waitUntil"];
  try {
    const context = getCloudflareContext();
    const env = context.env as { CF_VERSION_METADATA?: { id?: string } };
    deploymentId = env.CF_VERSION_METADATA?.id ?? "unknown";
    waitUntil = (promise) => context.ctx.waitUntil(promise);
  } catch {
    // Not running inside a Worker request (dev server, tests): no edge cache.
    return { cache: null, deploymentId };
  }
  return { cache, deploymentId, waitUntil };
}

export async function renderCacheKey(route: string, input: unknown, deploymentId: string): Promise<string> {
  const payload = JSON.stringify({ route, deploymentId, input });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function etagMatches(header: string | null, etag: string): boolean {
  if (!header) return false;
  return header.split(",").some((candidate) => candidate.trim().replace(/^W\//, "") === etag);
}

function withClientHeaders(body: BodyInit | null, contentType: string, etag: string, state: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": SHARE_IMAGE_BROWSER_CACHE_CONTROL,
      ETag: etag,
      "X-Render-Cache": state,
    },
  });
}

/**
 * Serves `render()`'s PNG through the edge cache. `render` runs only on a
 * miss; a non-200 render result is passed through untouched and never
 * cached.
 */
export async function cachedImageRender(
  request: Request | null,
  route: string,
  input: unknown,
  render: () => Promise<Response>,
  deps: RenderCacheDeps = defaultDeps()
): Promise<Response> {
  const hash = await renderCacheKey(route, input, deps.deploymentId);
  const etag = `"${hash.slice(0, 32)}"`;
  if (etagMatches(request?.headers?.get?.("if-none-match") ?? null, etag)) {
    return withClientHeaders(null, "image/png", etag, "REVALIDATED", 304);
  }

  const cacheKey = new Request(`https://render-cache.mindot.internal/${route}/${hash}`);
  if (deps.cache) {
    try {
      const hit = await deps.cache.match(cacheKey);
      if (hit) return withClientHeaders(hit.body, hit.headers.get("Content-Type") ?? "image/png", etag, "HIT");
    } catch {
      // A cache read failure only costs a re-render.
    }
  }

  const rendered = await render();
  if (rendered.status !== 200) return rendered;
  const bytes = await rendered.arrayBuffer();
  const contentType = rendered.headers.get("Content-Type") ?? "image/png";

  if (deps.cache && !rendered.headers.has(RENDER_NO_STORE_HEADER)) {
    const stored = new Response(bytes.slice(0), {
      headers: { "Content-Type": contentType, "Cache-Control": `public, max-age=${RENDER_CACHE_TTL_SECONDS}` },
    });
    const put = deps.cache.put(cacheKey, stored).catch(() => {});
    if (deps.waitUntil) deps.waitUntil(put);
    else await put;
  }
  return withClientHeaders(bytes, contentType, etag, "MISS");
}
