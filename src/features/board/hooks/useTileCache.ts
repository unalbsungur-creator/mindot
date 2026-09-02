"use client";

import { useEffect, useRef, useState } from "react";
import type { BoardTile } from "../types";
import { tileKey, type TileCoord } from "../lib/worldGeometry";

export type TileStatus = "loading" | "ready" | "empty" | "error";

export interface TileCacheEntry {
  status: TileStatus;
  tile?: BoardTile;
}

/** Caps memory: once exceeded, tiles farthest from the current wanted set are dropped first. */
const MAX_CACHED_TILES = 80;

/**
 * Fetches and caches board tiles for whatever coordinates are currently
 * "wanted" (visible + buffer, computed by the caller via
 * `visibleTileRange`). Dedupes in-flight requests, never re-fetches an
 * already-cached tile, and prunes the cache once it grows past
 * MAX_CACHED_TILES. This is the only place that talks to `/api/board`.
 */
export function useTileCache(wantedTiles: TileCoord[], initialTile?: BoardTile) {
  const [cache, setCache] = useState<Map<string, TileCacheEntry>>(() => {
    const initial = new Map<string, TileCacheEntry>();
    if (initialTile) {
      initial.set(tileKey(initialTile), {
        status: initialTile.messages.length > 0 ? "ready" : "empty",
        tile: initialTile,
      });
    }
    return initial;
  });

  const cacheRef = useRef(cache);
  const inFlight = useRef(new Set<string>());
  const wantedRef = useRef(wantedTiles);

  // A content-based signature, not the array itself — `wantedTiles` is a
  // fresh array every render, and depending on it directly would re-run
  // the fetch effect below on every render even when the tile set hasn't
  // changed. Declared before that effect so it runs first within the same
  // commit and the refs are current by the time the fetch effect reads them.
  const wantedSignature = wantedTiles.map(tileKey).sort().join("|");
  useEffect(() => {
    cacheRef.current = cache;
    wantedRef.current = wantedTiles;
  }, [cache, wantedTiles]);

  useEffect(() => {
    const wanted = wantedRef.current;
    const missing = wanted.filter((t) => {
      const key = tileKey(t);
      return !cacheRef.current.has(key) && !inFlight.current.has(key);
    });
    if (missing.length === 0) return;

    setCache((prev) => {
      const next = new Map(prev);
      missing.forEach((coord) => next.set(tileKey(coord), { status: "loading" }));
      return next;
    });

    missing.forEach((coord) => {
      const key = tileKey(coord);
      inFlight.current.add(key);

      fetch(`/api/board?tileX=${coord.x}&tileY=${coord.y}`)
        .then((res) => {
          if (!res.ok) throw new Error(String(res.status));
          return res.json() as Promise<BoardTile>;
        })
        .then((tile) => {
          setCache((prev) => {
            const next = new Map(prev);
            next.set(key, { status: tile.messages.length > 0 ? "ready" : "empty", tile });
            return pruneFarFromWanted(next, wantedRef.current);
          });
        })
        .catch(() => {
          setCache((prev) => {
            const next = new Map(prev);
            next.set(key, { status: "error" });
            return next;
          });
        })
        .finally(() => {
          inFlight.current.delete(key);
        });
    });
  }, [wantedSignature]);

  return cache;
}

function pruneFarFromWanted(cache: Map<string, TileCacheEntry>, wanted: TileCoord[]): Map<string, TileCacheEntry> {
  if (cache.size <= MAX_CACHED_TILES) return cache;

  const center = wanted[Math.floor(wanted.length / 2)] ?? { x: 0, y: 0 };
  const entries = [...cache.entries()].sort(
    (a, b) => distanceFromKey(b[0], center) - distanceFromKey(a[0], center)
  );

  const next = new Map(cache);
  const excess = cache.size - MAX_CACHED_TILES;
  for (let i = 0; i < excess; i++) {
    next.delete(entries[i][0]);
  }
  return next;
}

function distanceFromKey(key: string, center: TileCoord): number {
  const [x, y] = key.split(",").map(Number);
  return Math.hypot(x - center.x, y - center.y);
}
