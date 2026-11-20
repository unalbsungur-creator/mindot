import { getCacheKv, readThroughKvCache, TILE_CACHE_TTL_SECONDS, tileCacheKey } from "@/lib/kvCache";
import { getTile } from "../repository";
import type { BoardTile } from "../types";

/**
 * The public (viewer-less, range-less) tile, cached in KV for a minute.
 * `/board`'s first tile and `GET /api/board` without `personal=1` are the same
 * for everyone, so crawlers and signed-out visitors panning the wall no longer
 * query Neon on every request. A signed-in viewer's tile (block/like filtered)
 * and any time-range query never use this — they stay per-request.
 */
export function getPublicTileCached(x: number, y: number): Promise<BoardTile> {
  return readThroughKvCache({
    kv: getCacheKv(),
    key: tileCacheKey(x, y),
    ttlSeconds: TILE_CACHE_TTL_SECONDS,
    load: () => getTile(x, y),
  });
}
