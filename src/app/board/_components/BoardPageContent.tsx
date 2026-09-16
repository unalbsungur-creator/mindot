"use client";

import { useState } from "react";
import { BoardDiscoveryPanel, type BoardFilterResult } from "@/features/board/components/BoardDiscoveryPanel";
import { InfiniteBoard } from "@/features/board/components/InfiniteBoard";
import type { BoardTile } from "@/features/board/types";
import { useLocale } from "@/i18n/LocaleProvider";

/**
 * The real MINDOT exploration experience — an effectively infinite,
 * pannable/zoomable wall loading tiles on demand. `initialTile` (tile 0,0,
 * fetched server-side) seeds the client cache so the center of the board
 * paints immediately instead of starting from an empty frame. `centerPoint`
 * (resolved server-side, see app/board/page.tsx) is where the "return to
 * center" control actually goes — the real reference message's coordinate
 * when it's live, a safe fallback otherwise.
 *
 * EPIC — Duvar İçi Filtreleme: `BoardDiscoveryPanel` no longer renders its
 * own separate results list/"view on board" jump — filtering now happens
 * in place, on the board's own already-rendered world-space cards (see
 * `InfiniteBoard`'s `filter` prop). This is the one piece of state the two
 * siblings share: `BoardDiscoveryPanel` computes which message ids match
 * the active keyword/date/category filters (reusing the exact same
 * `/api/board/search` call it already made for EPIC 021's results list —
 * only what happens with the result changed, not how it's fetched) and
 * reports the outcome up here; `InfiniteBoard` consumes it purely as a
 * visibility mask over the tiles it was already going to render. Replaces
 * the earlier `focusPoint`/`onSelectResult` "jump the camera to a search
 * result" wiring, which no longer has a results list to jump from.
 */
export function BoardPageContent({
  initialTile,
  centerPoint,
}: {
  initialTile: BoardTile;
  centerPoint: { x: number; y: number };
}) {
  const { dictionary } = useLocale();
  const [filter, setFilter] = useState<BoardFilterResult>({ status: "idle", matchedIds: null });

  return (
    <div className="flex min-h-[calc(100dvh-5rem)] flex-col">
      <h1 className="sr-only">{dictionary.boardPage.title}</h1>
      <BoardDiscoveryPanel onFilterChange={setFilter} />
      <InfiniteBoard initialTile={initialTile} centerPoint={centerPoint} filter={filter} />
    </div>
  );
}
