"use client";

import { BrandMark } from "@/components/brand/BrandMark";
import { useLocale } from "@/i18n/LocaleProvider";
import { TILE_PX } from "../lib/worldGeometry";

/**
 * A quiet marker at the world origin — the starting point of a journey,
 * not a monument. Low opacity, no interaction, positioned in world-space
 * so it recedes naturally once the user pans away rather than needing its
 * own distance-based fade logic.
 */
export function BoardCenterMark() {
  const { dictionary } = useLocale();

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3"
      style={{ left: TILE_PX / 2, top: TILE_PX / 2 }}
    >
      <BrandMark className="h-16 w-16 opacity-[0.08]" />
      <span className="font-display text-sm italic text-navy/20 sm:text-base">
        {dictionary.boardPage.slogan}
      </span>
    </div>
  );
}
