"use client";

import { useState } from "react";
import { BoardDiscoveryPanel } from "@/features/board/components/BoardDiscoveryPanel";
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
 * EPIC 021: `focusPoint` is lifted here, not into `InfiniteBoard` itself —
 * `BoardDiscoveryPanel`'s "view on board" action sets it, `InfiniteBoard`
 * consumes it once and reports back via `onFocusHandled`, so the two
 * siblings never need to know about each other beyond this one value.
 */
export function BoardPageContent({
  initialTile,
  centerPoint,
}: {
  initialTile: BoardTile;
  centerPoint: { x: number; y: number };
}) {
  const { dictionary } = useLocale();
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(null);

  return (
    <div className="flex min-h-[calc(100dvh-5rem)] flex-col">
      <h1 className="sr-only">{dictionary.boardPage.title}</h1>
      <BoardDiscoveryPanel onSelectResult={setFocusPoint} />
      <InfiniteBoard
        initialTile={initialTile}
        centerPoint={centerPoint}
        focusPoint={focusPoint}
        onFocusHandled={() => setFocusPoint(null)}
      />
    </div>
  );
}
