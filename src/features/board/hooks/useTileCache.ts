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
 *
 * `personal`: a signed-in viewer reads `/api/board?personal=1` — their own
 * private, block-filtered tiles — instead of the shared public variant.
 * `generation`: bump it (e.g. right after blocking someone) to drop every
 * cached tile and fetch them again; responses still in flight from an
 * older generation are discarded, never written back.
 */
export function useTileCache(
  wantedTiles: TileCoord[],
  initialTile?: BoardTile,
  options: { personal?: boolean; generation?: number } = {}
) {
  const { personal = false, generation = 0 } = options;
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
  const generationRef = useRef(generation);
  const [resetCount, setResetCount] = useState(0);

  useEffect(() => {
    if (generationRef.current === generation) return;
    generationRef.current = generation;
    inFlight.current.clear();
    cacheRef.current = new Map();
    setCache(new Map());
    setResetCount((count) => count + 1);
  }, [generation]);

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

    const requestGeneration = generationRef.current;
    missing.forEach((coord) => {
      const key = tileKey(coord);
      inFlight.current.add(key);

      fetch(`/api/board?tileX=${coord.x}&tileY=${coord.y}${personal ? "&personal=1" : ""}`)
        .then((res) => {
          if (!res.ok) throw new Error(String(res.status));
          return res.json() as Promise<BoardTile>;
        })
        .then((tile) => {
          if (generationRef.current !== requestGeneration) return;
          setCache((prev) => {
            const next = new Map(prev);
            next.set(key, { status: tile.messages.length > 0 ? "ready" : "empty", tile });
            return pruneFarFromWanted(next, wantedRef.current);
          });
        })
        .catch(() => {
          if (generationRef.current !== requestGeneration) return;
          setCache((prev) => {
            const next = new Map(prev);
            next.set(key, { status: "error" });
            return next;
          });
        })
        .finally(() => {
          if (generationRef.current === requestGeneration) inFlight.current.delete(key);
        });
    });
  }, [wantedSignature, personal, resetCount]);

  return cache;
}

function pruneFarFromWanted(cache: Map<string, TileCacheEntry>, wanted: TileCoord[]): Map<string, TileCacheEntry> {
  // Never below what's on screen: at the widest zoom-out a large viewport can
  // want more than MAX_CACHED_TILES, and pruning visible tiles would just
  // refetch them in a loop.
  const limit = Math.max(MAX_CACHED_TILES, wanted.length);
  if (cache.size <= limit) return cache;

  const center = wanted[Math.floor(wanted.length / 2)] ?? { x: 0, y: 0 };
  const entries = [...cache.entries()].sort(
    (a, b) => distanceFromKey(b[0], center) - distanceFromKey(a[0], center)
  );

  const next = new Map(cache);
  const excess = cache.size - limit;
  for (let i = 0; i < excess; i++) {
    next.delete(entries[i][0]);
  }
  return next;
}

function distanceFromKey(key: string, center: TileCoord): number {
  const [x, y] = key.split(",").map(Number);
  return Math.hypot(x - center.x, y - center.y);
}
