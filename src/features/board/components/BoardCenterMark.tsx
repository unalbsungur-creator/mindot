"use client";

import Image from "next/image";

/**
 * EPIC 042: Board Watermark Logo Replacement. Was a world-space marker at
 * the world origin (a `BrandMark` + localized slogan, positioned via
 * `TILE_PX/2` world coordinates as a child of `worldRef` — panned/scaled
 * away with the board by design, "receding naturally" as the user moved
 * away from center). Replaced with the new
 * `public/images/backgrounds/aklında_kalmasın.png` asset (provided,
 * already-designed — never generated or substituted here), rendered as a
 * **viewport-fixed** watermark instead: this EPIC's brief explicitly
 * requires it stay centered on screen and never move with pan/zoom, the
 * opposite positioning model from before. `InfiniteBoard.tsx` now renders
 * this as a sibling of `worldRef` (not a child of it) for exactly that
 * reason — see its own EPIC 042 comment.
 *
 * The asset is a single flat 1254×1254 PNG with an *opaque* dark-navy
 * background baked in (confirmed directly — no alpha channel), combining
 * both the dot-mark and the "Aklında kalmasın" wordmark that used to be
 * two separately-styled elements (`BrandMark` at one opacity, the slogan
 * `<span>` at another). Since it's now one bitmap, only one opacity value
 * applies to the whole thing — `0.08` matches the original mark's own
 * opacity (the more-conservative of the two prior values), kept low
 * enough that the image's own navy square doesn't read as a visible dark
 * block against the board's cream canvas, while the dot pattern and
 * wordmark stay faintly legible up close — a watermark, not a flat tint.
 *
 * Rendered at a fixed, modest on-screen size (not `fill`+`object-cover`
 * like StarField — this is a small centered mark, not a full-bleed
 * texture) via `next/image`'s intrinsic `width`/`height` sizing, which
 * still gets Next's automatic format/quality optimization.
 *
 * EPIC 043 (Size Correction): `h-28 w-28` (112×112px) first, down from
 * EPIC 042's `h-56 w-56` (224×224px) — the larger size read as visually
 * bigger than a board card. EPIC 043 (Final Adjustment): `h-44 w-44`
 * (176×176px) — matched to a standard note card's own width (`w-44` is
 * the exact size `Note.tsx` uses at desktop width) — plus, in that same
 * revision, `mix-blend-mode: screen` at `opacity: 0.2`. Real-browser QA
 * of *that* combination (EPIC 044's own repository analysis + direct
 * visual check) found it overcorrected: `screen` pushes every non-black
 * pixel toward white as it composites, so at a low opacity the "Aklında
 * kalmasın" wordmark and dot-mark washed out to being barely more
 * legible than the original opacity-only version — not what "logo
 * clearly visible, wordmark clearly readable" (EPIC 044's explicit
 * requirement) needs.
 *
 * EPIC 044 (this revision): back to normal blending (no
 * `mix-blend-mode` at all) at `opacity: 0.35` — squarely in the
 * "visible, not just technically present" range this EPIC asked for,
 * and high enough that the wordmark/dot-mark read clearly without
 * hunting for them. That opacity alone would make the PNG's opaque navy
 * background square plainly visible as a soft rectangle behind the
 * logo — explicitly against this EPIC's "no obvious square" acceptance
 * criterion, but also explicitly *not* to be solved by hiding the logo
 * itself again. The fix is a radial `mask-image` on the image itself
 * (not `mix-blend-mode`, not a second lower opacity): fully opaque
 * through the circular area where the real dot-mark/wordmark content
 * lives, fading to fully transparent by the image's actual corners —
 * exactly the flat, empty navy regions with no logo content to lose.
 * This erodes the square's corners into the board's cream/star
 * background while leaving the logo's own opacity/visibility completely
 * untouched anywhere content actually exists.
 *
 * `zIndex: 0` (not `-1`) for the same reason `StarField`/the atmosphere
 * wash both use it in `InfiniteBoard.tsx` (see that file's EPIC 041/042
 * comments) — `worldRef`'s own active `transform` promotes it to a
 * stacking context that fully occludes a negative-z-index sibling behind
 * it; `0`, combined with this element coming before `worldRef` in DOM
 * order, still paints behind every card while actually being visible.
 *
 * Inline style, not a Tailwind `opacity-[…]`/`inset-0` utility — this
 * session has repeatedly confirmed arbitrary-value utilities can silently
 * fail to compile under this project's dev server; StarField.tsx and the
 * atmosphere wash both already use the identical inline-style pattern for
 * the same reason.
 */
export function BoardCenterMark() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute flex items-center justify-center overflow-hidden"
      style={{ zIndex: 0, top: 0, right: 0, bottom: 0, left: 0 }}
    >
      <Image
        src="/images/backgrounds/aklında_kalmasın.png"
        alt=""
        width={1254}
        height={1254}
        className="h-44 w-44 object-contain"
        style={{
          opacity: 0.35,
          // Fades the PNG's flat navy corners to transparent while
          // staying fully opaque through the circular area the real
          // dot-mark/wordmark content occupies — see the doc comment
          // above for why this replaces `mix-blend-mode: screen`.
          maskImage: "radial-gradient(circle at center, black 58%, transparent 96%)",
          WebkitMaskImage: "radial-gradient(circle at center, black 58%, transparent 96%)",
        }}
      />
    </div>
  );
}
