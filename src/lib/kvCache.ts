import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Short-lived read-through cache on Cloudflare KV for public, anonymous
 * database reads.
 *
 * Why: the Worker has no incremental (ISR) cache, so a page that reads the
 * database renders — and queries Neon — on every request. Anonymous traffic
 * (bots included) therefore kept the database awake around the clock. A cached
 * value answers from KV and never opens a connection; Neon can scale to zero
 * between the (at most one per TTL per key) refreshes.
 *
 * Only ever use it for data that is the same for every viewer. It shares the
 * `MODERATION_ALERTS_KV` namespace (separate `cache:` keys — one binding per
 * environment, staging has its own), so no new infrastructure is needed.
 *
 * Failure policy: any KV problem (no binding, error, malformed value) falls
 * through to the loader — the cache can slow nothing down and hide nothing.
 */

/** The subset of a KV namespace this module uses. */
export interface CacheKv {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

/** Cloudflare KV refuses an expirationTtl below 60 seconds. */
export const KV_MIN_TTL_SECONDS = 60;

export const HOME_CACHE_KEY = "cache:home:v1";
export const TILE_CACHE_TTL_SECONDS = 60;
export const HOME_CACHE_TTL_SECONDS = 300;

export function tileCacheKey(x: number, y: number): string {
  return `cache:tile:v1:${x}:${y}`;
}

export function getCacheKv(): CacheKv | null {
  try {
    return (getCloudflareContext().env as { MODERATION_ALERTS_KV?: CacheKv }).MODERATION_ALERTS_KV ?? null;
  } catch {
    return null;
  }
}

export async function readThroughKvCache<T>(options: {
  kv: CacheKv | null | undefined;
  key: string;
  ttlSeconds: number;
  load: () => Promise<T>;
}): Promise<T> {
  const { kv, key, ttlSeconds, load } = options;
  if (!kv) return load();

  try {
    const raw = await kv.get(key);
    if (raw !== null) return JSON.parse(raw) as T;
  } catch {
    // Unreadable or malformed: treat as a miss and rewrite below.
  }

  const value = await load();
  try {
    await kv.put(key, JSON.stringify(value), { expirationTtl: Math.max(KV_MIN_TTL_SECONDS, Math.round(ttlSeconds)) });
  } catch {
    // The value is still good; the next request just reads the database again.
  }
  return value;
}

/** Drops cached keys after content changed (best effort — the TTL is the backstop). */
export async function invalidateKvCache(keys: string[], kv: CacheKv | null | undefined = getCacheKv()): Promise<void> {
  if (!kv) return;
  await Promise.all(keys.map((key) => kv.delete(key).catch(() => undefined)));
}
