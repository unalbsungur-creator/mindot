import Image from "next/image";
import type { CSSProperties } from "react";

/**
 * EPIC 038: the single shared decorative star-field atmosphere layer —
 * used by HomeHero, MeaningStrip, and InfiniteBoard, always as a
 * `position: absolute` sibling of the section's real content, never
 * nested inside anything that pans/scales (see InfiniteBoard.tsx's own
 * doc comment for why that matters there specifically).
 *
 * `zIndex: -1` (inline, not a `-z-*` class) guarantees this paints behind
 * every non-positioned in-flow child regardless of DOM order — a plain
 * `position: absolute` sibling with `z-index: auto` would otherwise paint
 * *above* normal-flow content under standard CSS stacking rules, since
 * positioned elements always paint after non-positioned in-flow content.
 * Every call site's parent already establishes the `position: relative`
 * stacking context this depends on.
 *
 * `next/image` (not a plain CSS `background-image`) so the real source
 * asset (5000×3542, ~787KB) is served through Next's automatic
 * format/quality/responsive-size optimization instead of every device
 * downloading the full file. `fill` + `object-cover` replicate
 * `background-size: cover; background-position: center` for a full-bleed
 * decorative backdrop. `alt=""` plus the wrapper's `aria-hidden`/
 * `pointer-events-none` is belt-and-braces: purely decorative, never
 * announced, never intercepts a click/pan/touch.
 *
 * `opacity` is the one thing each call site tunes; everything else stays
 * identical across all three usages so the same asset reads as one
 * continuous atmosphere rather than three different treatments.
 *
 * EPIC 041: `blendMode` is the one other optional per-call-site knob,
 * added for InfiniteBoard specifically — its `bg-canvas` cream base needs
 * `mix-blend-mode: multiply` (see InfiniteBoard.tsx's own EPIC 041 comment
 * for why) to actually read as visible atmosphere, where HomeHero/
 * MeaningStrip's navy base already works correctly with plain normal
 * blending. Defaults to `undefined` — CSS's normal blend mode — so neither
 * existing call site (which never passes it) renders any differently than
 * before this EPIC.
 *
 * Applied to the outer wrapper `<div>`, not the `<Image>` itself —
 * confirmed by real-browser testing that `mix-blend-mode` on the image
 * silently does nothing there: that wrapper already establishes its own
 * stacking context (`position: absolute` + negative `z-index`), so a blend
 * mode on a descendant of it can only ever blend against paint *within*
 * that same context, which contains nothing but the image itself. Putting
 * the blend mode on the wrapper instead makes it blend against what's
 * actually behind that div in its *parent's* stacking context — the real
 * `bg-canvas`/atmosphere-wash backdrop this exists to darken.
 *
 * EPIC 041: `zIndex` is now an optional override (still defaults to `-1`,
 * so HomeHero/MeaningStrip — which never pass it — are byte-for-byte
 * unchanged). InfiniteBoard passes `zIndex={0}` specifically: confirmed by
 * real-browser testing (injecting plain positioned test elements at both
 * values) that `worldRef`'s own active `transform` (applied imperatively
 * for 60fps pan/zoom — see InfiniteBoard.tsx) promotes it to a stacking
 * context that fully occludes ANY negative-z-index sibling underneath it,
 * not merely paints over it at low contrast — this, not opacity, is *why*
 * EPIC 038's board star field read as "essentially imperceptible": it was
 * actually fully hidden. `zIndex: 0` (still placed first in DOM order, so
 * it still paints behind every sibling that follows it) sits in the same
 * paint step as `worldRef` itself rather than being excluded from it
 * entirely, and was confirmed visible in that same test. HomeHero/
 * MeaningStrip have no transformed descendant, so `-1` already works
 * correctly for them and is left untouched.
 */
export function StarField({
  opacity,
  priority = true,
  blendMode,
  zIndex = -1,
}: {
  opacity: number;
  priority?: boolean;
  blendMode?: CSSProperties["mixBlendMode"];
  zIndex?: number;
}) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute overflow-hidden"
      style={{ zIndex, top: 0, right: 0, bottom: 0, left: 0, mixBlendMode: blendMode }}
    >
      <Image
        src="/images/backgrounds/star-field.jpg"
        alt=""
        fill
        priority={priority}
        sizes="100vw"
        className="object-cover"
        style={{ opacity }}
      />
    </div>
  );
}
