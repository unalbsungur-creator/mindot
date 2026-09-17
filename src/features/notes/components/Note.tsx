import type { CSSProperties, ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { getNoteTemplate } from "../config/templates";
import { FrostDrift, renderNoteDecoration } from "../lib/noteDecorations";
import { footballBallBackground } from "../lib/sportsBall";
import { noteFontFamilyClass, noteTextScaleClass } from "../lib/textScale";
import type { NoteData } from "../types";

const paperClasses: Record<string, string> = {
  yellow: "bg-paper-yellow",
  cream: "bg-paper-cream",
  blue: "bg-paper-blue",
  pink: "bg-paper-pink",
  kraft: "bg-paper-kraft",
  white: "bg-paper-white",
  mint: "bg-paper-mint",
};

const sizeClasses: Record<NoteData["size"], string> = {
  sm: "w-36",
  md: "w-44",
  lg: "w-52",
};

const shapeClasses: Record<string, string> = {
  sticky: "rounded-sm",
  rect: "rounded-sm",
  minimal: "rounded-md border border-border",
  vintage: "rounded-sm border border-black/5",
  index: "rounded-sm",
  polaroid: "rounded-sm pb-8",
  notebook: "rounded-sm border-l-4 border-orange-soft/70",
  folded: "rounded-sm",
  torn: "rounded-none [clip-path:polygon(0%_0%,100%_0%,100%_92%,94%_100%,86%_90%,78%_100%,70%_91%,62%_100%,54%_90%,46%_100%,38%_91%,30%_100%,22%_90%,14%_100%,6%_91%,0%_100%)]",
  tag: "rounded-sm [clip-path:polygon(18%_0%,100%_0%,100%_100%,0%_100%,0%_28%)]",
  // EPIC: Special Day Post-it Shapes & Decorative Styles. Every shape below
  // belongs to exactly one occasion template — none is shared with a
  // standard template's `shape`, so none of these can ever change how an
  // existing standard design renders. "heart" is intentionally absent here
  // (its clip-path needs a unique per-instance <clipPath> id — see below).
  confetti:
    // A soft, asymmetric rounded-square rather than a perfect rounded-2xl
    // corner on every side — organic without a bespoke SVG outline.
    "rounded-[30%_14%_30%_14%/22%_30%_22%_30%]",
  bloom:
    // The classic CSS "organic blob" trick (four independent x/y corner
    // radii) — a soft, petal-like silhouette with no clip-path/SVG at all.
    "rounded-[62%_38%_38%_62%/60%_42%_58%_40%]",
  burst:
    // Same blob technique as "bloom", mirrored/more asymmetric for a more
    // energetic, less floral silhouette — deliberately not a jagged
    // starburst outline, which would risk unreadable text corners.
    "rounded-[28%_72%_66%_34%/32%_28%_72%_68%]",
  craft:
    // Two opposite corners cut at a shallow angle — a "trimmed by hand"
    // feel without touching the shared "rect"/"tag" corner treatments.
    "rounded-sm [clip-path:polygon(14px_0,100%_0,100%_calc(100%-14px),calc(100%-14px)_100%,0_100%,0_14px)]",
  frost:
    // All four corners cut evenly (an octagon) — sharp but balanced/
    // symmetric geometry reading as faceted/crystalline, pure CSS.
    "rounded-none [clip-path:polygon(16px_0,calc(100%-16px)_0,100%_16px,100%_calc(100%-16px),calc(100%-16px)_100%,16px_100%,0_calc(100%-16px),0_16px)]",
  diploma:
    // One large corner fold (bigger than the shared "folded" shape's own
    // decorative triangle overlay) — a certificate/scroll-corner read.
    "rounded-sm [clip-path:polygon(0_0,calc(100%-22px)_0,100%_22px,100%_100%,0_100%)]",
  ribbon:
    // Both top corners notched inward — a banner/gift-tag top edge.
    "rounded-sm [clip-path:polygon(0_14px,14px_0,calc(100%-14px)_0,100%_14px,100%_100%,0_100%)]",
  // EPIC 039: not actually read (the football branch below bypasses
  // paperClasses/shapeClasses entirely for its own two-tone background) —
  // kept for registry completeness/documentation only.
  football: "rounded-full",
};

/**
 * A true heart silhouette (not just a heart icon on a square card) needs a
 * smooth curve a Tailwind arbitrary-value `clip-path: polygon(...)` can't
 * produce — so this is the one shape using an inline `<clipPath
 * clipPathUnits="objectBoundingBox">`, normalized to the unit square so it
 * scales correctly to any note size, referenced by a per-instance id (SVG
 * ids must be unique per document — a page can render many notes at once,
 * e.g. TemplatePicker's whole grid) rather than one shared global id.
 *
 * Exported (unlike this file's other internals) so a non-DOM renderer that
 * can't apply `clipPathUnits="objectBoundingBox"` — the Memory Print share
 * card's Satori/`next-og` renderer, notably — can still draw the exact
 * same curve by scaling these 0..1 coordinates to its own pixel box,
 * rather than hand-copying (and risking drift from) this path data. See
 * features/sharing/services/noteCardSatori.tsx.
 */
export const HEART_PATH =
  "M0.5,1 C0.5,1 0.05,0.65 0.05,0.35 C0.05,0.15 0.2,0 0.35,0 C0.45,0 0.5,0.08 0.5,0.16 C0.5,0.08 0.55,0 0.65,0 C0.8,0 0.95,0.15 0.95,0.35 C0.95,0.65 0.5,1 0.5,1 Z";

/**
 * EPIC: Professional hover actions. Small, quiet glyphs for the note's
 * optional secondary actions — replaces the earlier always-legible text
 * pills ("Bu düşünceyi sakla" / "Paylaş" floating above the card) with an
 * icon-first toolbar; the words themselves move to a hover/focus-only
 * tooltip (see the `actions` rendering below), matching MINDOT's editorial
 * design language rather than reading as a placeholder/prototype control.
 */
const actionIcons: Record<"save" | "share" | "report", ReactNode> = {
  save: (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth={1.5} strokeLinejoin="round">
      <path d="M4 2.5h8a.5.5 0 01.5.5v10.5l-4.5-2.8-4.5 2.8V3a.5.5 0 01.5-.5Z" />
    </svg>
  ),
  share: (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 10.5V2M8 2 5.2 4.8M8 2l2.8 2.8" />
      <path d="M3 8.5v4.2a.8.8 0 00.8.8h8.4a.8.8 0 00.8-.8V8.5" />
    </svg>
  ),
  // EPIC 012: User Content Reporting — a plain outlined flag, the same
  // quiet weight/stroke as save/share above so a report entry point never
  // reads as more urgent or more prominent than "preserve"/"share" do.
  report: (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 1.5v13" />
      <path d="M3.5 2.5h7l-1.6 2.5 1.6 2.5h-7Z" />
    </svg>
  ),
};

interface NoteProps {
  note: NoteData;
  /**
   * "board": scattered across the board preview, positioned via `sm:absolute`
   * (the default, unchanged from EPIC 001) — mobile falls back to a
   * horizontal-scroll row. "static": rendered in normal document flow with
   * its rotation but no absolute placement — for a single note shown on its
   * own, like the write-flow preview. "world": always absolutely positioned
   * (no `sm:` mobile fallback) at percentage coordinates within its parent
   * — for a note placed inside one tile of the interactive infinite board,
   * where every device pans/zooms the same canvas rather than falling back
   * to a scroll list.
   */
  variant?: "board" | "static" | "world";
  /**
   * Optional, generic secondary actions on the note itself — e.g. the
   * infinite board's "preserve this thought" and "share" entry points into
   * features/memories and features/sharing. Deliberately generic (not
   * feature-specific naming) so this stays a reusable primitive rather
   * than coupling Note to any one feature. An array (not a single action)
   * so the board can offer more than one without Note growing a second,
   * competing prop per feature. Rendered inside Note's own hover/focus
   * state so it appears with the same interaction that already lifts the
   * note, instead of needing a second wrapper element (which would break
   * the percentage-based absolute positioning "world"/"board" variants
   * depend on).
   *
   * `icon` picks a small glyph for the action's always-visible button —
   * `label` is still the button's real accessible name (`aria-label`) and
   * also the text shown in the hover/focus-only tooltip. A closed vocabulary
   * (not an arbitrary icon prop) because this stays a generic board
   * primitive: it names *what kind* of secondary action this is, not which
   * feature owns it.
   *
   * EPIC 012: `onClick` is the report action's addition — a report opens a
   * dialog rather than navigating, so it can't be `href`-only like
   * preserve/share. Exactly one of `href`/`onClick` is expected per entry;
   * the renderer below picks a `<Link>` or a plain `<button>` accordingly,
   * same visual treatment either way.
   */
  actions?: { href?: string; onClick?: () => void; label: string; icon: "save" | "share" | "report" }[];
  /**
   * EPIC: Message Like System — optional and only ever passed by the real
   * board (InfiniteBoard), never by the write-flow preview, template
   * picker, personal wall, hero notes, or the PDF/share-card renderers:
   * those don't represent a currently-approved public message a like
   * would mean anything for. `liked` disables the button rather than
   * toggling it (no unlike) and `count` is always the real server value,
   * never inferred client-side.
   */
  like?: {
    count: number;
    liked: boolean;
    onLike: () => void;
    label: string;
    likedLabel: string;
  };
  /**
   * EPIC 040: Mobile Note Card Actions: Tap-to-Reveal. `true` when this is
   * the one card whose `actions` (save/share/report) should be visible on
   * a touchscreen — driven entirely by the parent (`InfiniteBoard`'s
   * `activeNoteId`), never local state, so only one note board-wide can
   * ever be active at once. Only affects the `pointer-coarse:` (touch)
   * reveal below; desktop's mouse hover/keyboard-focus reveal is
   * completely independent of this prop and unconditionally unchanged —
   * see the `actions.length > 0` block's className for exactly where.
   * Unused (and harmless if omitted) by every non-board caller, since none
   * of them ever pass `actions` in the first place.
   */
  active?: boolean;
  /**
   * EPIC 040: called when the card itself (not one of its action buttons,
   * which have their own `onClick`) is tapped/clicked — the parent sets
   * its `activeNoteId` to this note's id in response. Deliberately a plain
   * `onClick` with no `onPointerDown`/`stopPropagation` of its own (unlike
   * the action/like buttons below): a genuine tap fires the browser's
   * native `click` after pointerup with negligible movement regardless,
   * and — critically — a drag gesture that happens to *start* on a note
   * must keep reaching `InfiniteBoard`'s own pan handling on `pointerdown`
   * completely untouched, or panning-from-a-card would break (confirmed
   * real requirement — EPIC 040 QA's Senaryo E).
   */
  onActivate?: () => void;
}

export function Note({ note, variant = "board", actions = [], like, active = false, onActivate }: NoteProps) {
  const template = getNoteTemplate(note.templateId);
  const isHeart = template.shape === "heart";
  const isFootball = template.shape === "football";
  // EPIC: Kart Tasarımı Fidelity — the template's real PNG artwork *is* the
  // card (object-fit: contain, full card), with the user's message/author
  // positioned as an HTML overlay inside `template.contentArea` — instead
  // of this file's own paper/shape/attachment/decoration reconstruction.
  // Only a template that sets both `image` and `contentArea` takes this
  // path (currently just "birthday-confetti"); every other template is
  // byte-for-byte unaffected.
  const isImageBacked = Boolean(template.image && template.contentArea);
  // `note.id` is already unique per rendered note (real message id, or a
  // stable "template-preview-<id>"/"preview" id for picker/write-flow
  // previews) — reused as the clip-path id's uniqueness source rather than
  // introducing a new prop, so many heart notes can render on one page
  // (e.g. TemplatePicker's grid) without colliding SVG ids.
  const heartClipId = isHeart ? `note-heart-${note.id}` : undefined;
  // EPIC — Kart Yazı Tipi Seçenekleri: the writer's own font choice —
  // independent of `template.font` (a property of the template's paper
  // design, no longer consulted for the note's own text rendering; see
  // lib/textScale.ts's module doc comment). Defaults "modern" for any
  // `NoteData` built before this field existed.
  const fontFamily = note.fontFamily ?? "modern";
  const fontFamilyClass = noteFontFamilyClass(fontFamily);
  // EPIC 045: card geometry (width, and heart/football's fixed
  // aspect-ratio height) never changes with content — only this tier does,
  // so long text (up to MESSAGE_MAX_LENGTH) stays inside the same fixed
  // box instead of deforming or overflowing it. See lib/textScale.ts.
  const textScaleClass = noteTextScaleClass(note.content.length, fontFamily, isFootball ? "football" : "standard");

  return (
    <article
      // EPIC 040: presence-only marker `InfiniteBoard`'s own "tapped empty
      // board space" handler uses (`event.target.closest('[data-note-card]')`)
      // to tell "this click landed on/inside a note" from "this click hit
      // the bare canvas" — inert everywhere else (write-flow preview,
      // personal wall, hero notes never read it).
      data-note-card=""
      onClick={onActivate}
      className={cn(
        "group flex shrink-0 flex-col",
        // BUG FIX: DUVAR Post-it Rendering Fix. `variant === "world"` needs
        // `position: absolute` unconditionally (no responsive fallback,
        // unlike "board"'s `sm:absolute`). Tailwind's plain (non-responsive)
        // `relative` and `absolute` utilities share the same cascade layer
        // and specificity, so which one wins is decided by their order in
        // the *generated stylesheet*, not by their order in this class
        // string — and that generated order isn't guaranteed to match
        // source order, so having both classes present at once for the
        // same variant is unsafe by construction. Confirmed on the real
        // `/board` page: a "world" note's *computed* `position` was
        // "relative", not "absolute" — every board note was silently
        // pushed into normal document flow (stacking downward, "top"/
        // "left" percentages applied as relative offsets instead of tile-
        // relative coordinates), then clipped by the viewport's
        // `overflow-hidden` far below where it belonged. "board" is safe
        // because `sm:absolute` is a responsive (media-query) utility —
        // Tailwind always places the responsive layer after the base
        // layer, so it reliably wins regardless of base-layer utility
        // order; "world"'s own `absolute` had no such protection. Fixed by
        // never emitting both position utilities for the same variant:
        // exactly one of "relative"/"absolute" is chosen up front.
        variant === "world" ? "absolute" : "relative",
        isHeart && "aspect-[4/5]",
        // EPIC 046: `aspect-square` alone is only a *preferred* size — a
        // browser's automatic-minimum-size rule still lets the box grow
        // taller than square when content's own intrinsic height exceeds
        // it (confirmed via real getBoundingClientRect() measurement: a
        // 150-char message rendered 182×188px, not 182×182px, silently
        // turning the ball into a capsule). `overflow-hidden` removes that
        // automatic minimum (per the CSS box-sizing spec, it only applies
        // when overflow is `visible`), making the circle geometry a hard
        // constraint instead of a hint — never a text-truncation risk in
        // practice, since the football branch's own font tiers (see
        // lib/textScale.ts) are sized to keep MESSAGE_MAX_LENGTH content
        // within this exact box.
        isFootball && "aspect-square overflow-hidden",
        // Same fixed-geometry idea as heart/football above, but the ratio
        // comes from the template's own artwork (`imageWidth`/`imageHeight`)
        // rather than a constant — set via inline style below since
        // Tailwind can't compile an arbitrary per-template aspect-ratio.
        isImageBacked && "overflow-hidden",
        variant === "board" &&
          "sm:absolute sm:top-[var(--note-top)] sm:left-[var(--note-left)] sm:rotate-[var(--note-rotate)]",
        variant === "static" && "rotate-[var(--note-rotate)]",
        variant === "world" &&
          "z-[var(--z-note)] top-[var(--note-top)] left-[var(--note-left)] rotate-[var(--note-rotate)]",
        "transition-transform duration-[var(--motion-base)] ease-[var(--ease-standard)]",
        "hover:-translate-y-1 hover:z-[var(--z-note-hover)]",
        variant === "board" && "sm:hover:rotate-0",
        // EPIC 042: on a narrow phone viewport, `variant="world"`'s normally
        // fixed CSS pixel width (the board is a zoom=1-at-default canvas —
        // see worldGeometry.ts's DEFAULT_ZOOM — where 1 world unit is 1 CSS
        // pixel, so a note's rendered size never itself scales with camera
        // zoom the way, say, a map marker's *label* often would) eats a much
        // bigger share of the screen than it does on desktop, reading as
        // cards crowding each other even though their actual world-space
        // jitter positions (server-computed at approval time — see
        // placement.ts) haven't changed at all. Real-browser testing this
        // EPIC confirmed Tailwind's `max-sm:` variant family doesn't
        // compile in this project at all (not present anywhere in the
        // built stylesheet, in any form) — mobile-first `"w-36 sm:w-44"`
        // (world only) achieves the identical visual result using only the
        // plain `sm:` (min-width) variant already proven throughout this
        // codebase: the "sm" width below 640px, growing to the original
        // "md" width at 640px and up. `tileToNoteData` (InfiniteBoard.tsx)
        // only ever sets `size: "md"` for world notes today, so hardcoding
        // both tokens here (rather than deriving from `sizeClasses`) is a
        // direct, easily-audited match, not a guess. Every other variant
        // ("board"/"static") is untouched — still exactly
        // `sizeClasses[note.size]` at every viewport, byte-identical to
        // before this EPIC.
        variant === "world" ? "w-36 sm:w-44" : sizeClasses[note.size]
      )}
      style={
        {
          "--note-top": note.position.top,
          "--note-left": note.position.left,
          "--note-rotate": `${note.rotation}deg`,
          ...(isImageBacked ? { aspectRatio: `${template.imageWidth} / ${template.imageHeight}` } : {}),
        } as CSSProperties
      }
    >
      {isHeart && (
        // Zero-size, purely a clip-path source — never rendered visually.
        <svg aria-hidden="true" className="absolute h-0 w-0">
          <defs>
            <clipPath id={heartClipId} clipPathUnits="objectBoundingBox">
              <path d={HEART_PATH} />
            </clipPath>
          </defs>
        </svg>
      )}
      {/*
       * BUG FIX: Template Preview / Note Geometry Clipping. `clip-path`
       * (the "torn"/"tag"/"craft"/"frost"/"diploma"/"ribbon" shape classes,
       * and the heart's own `clipPath: url(#...)`) clips a *whole element's
       * rendered content* to its polygon — including any descendant
       * positioned outside that element's own box, regardless of
       * `overflow`. Confirmed directly (DOM computed-style inspection +
       * before/after screenshot with clip-path stripped via devtools):
       * every one of this card's intentionally-overflowing children —
       * the pin/tape attachment, the corner decoration icon, the author
       * avatar, the like button — sat as direct children of the same
       * `<article>` this style used to be on, so any clip-path shape
       * silently cropped them to slivers (first reproduced on
       * graduation-honor's pin + graduation-cap, both of which sit above
       * the card via negative offsets). `Note` is the one shared renderer
       * for the write-flow preview, the board, and the world/tile view —
       * so this wasn't a preview-only cosmetic bug, it was already live on
       * `/board` for every approved message using a clip-path template
       * with an attachment, decoration, avatar, or like count.
       *
       * Fix: the shape/paper/clip-path/padding/text now live on this inner
       * wrapper instead of the outer `<article>`; the article itself keeps
       * only position/rotation/sizing and is never clipped, so every
       * overflowing child below stays a sibling of this wrapper — visually
       * layered on top of the shape, never cropped by it. `flex-1` lets
       * this wrapper fill the article's full height when that height is
       * fixed by `aspect-[4/5]` (heart); for every other shape, the
       * article's height still simply derives from this wrapper's own
       * content, exactly as before.
       */}
      <div
        className={cn(
          "relative flex flex-1 flex-col gap-3",
          "shadow-note group-hover:shadow-note-hover",
          isHeart && "justify-center px-7 pb-10 pt-7",
          // EPIC 047: `overflow-hidden`+`min-h-0` here (not just on the
          // outer `<article>`/inner cream disc) is load-bearing, not
          // decorative — confirmed by a real rendering defect this fixes.
          // This wrapper is a `flex-1` flex item inside the article's fixed-
          // height (`aspect-square`) flex column; by the CSS flexbox spec, a
          // flex item's *automatic* minimum size defaults to its content's
          // min-content size (not 0) unless the item's own `overflow` is
          // non-`visible`. Without that, the inner disc's `h-[82%]` had
          // nothing definite to resolve against whenever its own text
          // content's natural (unclamped) height exceeded 176px — the
          // percentage silently fell back to "auto," letting the disc grow
          // to the text's real height with no 144px ceiling at all. Real
          // rendering confirmed the result: a `rounded-full` element far
          // taller than it is wide renders as a pill, then gets clipped by
          // the article's own `overflow-hidden` partway down — a dome/arch
          // shape instead of a circle, with the message's own text visibly
          // cut off mid-sentence. `overflow-hidden` makes this wrapper's
          // automatic minimum size 0 per spec, so `flex-1` can actually
          // shrink it to the article's real 176px, which makes the disc's
          // `h-[82%]` resolve against a definite height again — restoring
          // the fixed, content-independent circle every other safeguard
          // here already assumes.
          isFootball && "items-center justify-center overflow-hidden rounded-full p-0",
          isImageBacked && "overflow-hidden rounded-sm p-0",
          !isHeart && !isFootball && !isImageBacked && "p-4",
          !isFootball && !isImageBacked && paperClasses[template.paper],
          !isHeart && !isFootball && !isImageBacked && shapeClasses[template.shape]
        )}
        style={
          heartClipId
            ? { clipPath: `url(#${heartClipId})` }
            : isFootball
              ? footballBallBackground(template.primaryColor!, template.secondaryColor!, template.accentColor)
              : undefined
        }
      >
        {!isImageBacked && template.shape === "polaroid" && (
          <span aria-hidden="true" className="-mx-4 -mt-4 mb-1 block h-24 bg-navy/10" />
        )}
        {!isImageBacked && template.shape === "folded" && (
          <span
            aria-hidden="true"
            className="absolute right-0 top-0 h-5 w-5 bg-surface [clip-path:polygon(100%_0,0_0,100%_100%)]"
          />
        )}
        {/* New Year Frost's reference has a light wavy drift along the
            bottom edge — sits inside the shape wrapper (never overflows
            it), same idiom as the polaroid/folded blocks above. */}
        {!isImageBacked && template.shape === "frost" && <FrostDrift />}
        {isImageBacked ? (
          <>
            {/* The template's real artwork, shown at its own aspect ratio
                (the article's inline `aspectRatio` above always matches it
                exactly, so `object-contain` fills edge-to-edge with no
                letterboxing) — decorative, the message text below is the
                real accessible content. */}
            <Image
              src={template.image!}
              alt=""
              fill
              sizes="220px"
              className="object-contain"
            />
            {/* The template's own clean/empty region (see `contentArea`'s
                doc comment in types.ts — located by direct pixel inspection
                of this exact artwork, not guessed) — real HTML text, never
                rasterized into the image, so it stays selectable/accessible
                and never touches the PNG's own pixels. */}
            <div
              className="absolute flex flex-col justify-center overflow-hidden"
              style={{
                top: template.contentArea!.top,
                left: template.contentArea!.left,
                width: template.contentArea!.width,
                height: template.contentArea!.height,
              }}
            >
              <p
                lang={note.language}
                className={cn("break-words text-ink", textScaleClass, fontFamilyClass)}
              >
                {note.content}
              </p>
              <span className="break-words text-xs text-ink-soft">— {note.authorName}</span>
            </div>
          </>
        ) : isFootball ? (
          // EPIC 039: the ball's colored surface (set via `style` above)
          // stays behind this smaller, always-light inset disc — real note
          // text needs to stay legible regardless of which two colors a
          // writer's chosen ball uses (a black+navy ball, say, would make
          // the standard dark `text-ink` unreadable directly on it).
          // EPIC 046: 82% (was 70%) — more usable text area inside a still
          // content-independent, fixed proportion (never derived from
          // content length), while the remaining ~18% ring keeps the
          // colored ball bands clearly visible. `overflow-hidden` is the
          // same hard geometry guarantee as the outer article above,
          // one level deeper: without it, this disc's own `h-[]/w-[]`
          // percentage is only a preferred size too, and real
          // measurement (150-char content) showed it silently growing
          // ~8px taller than its own declared height, letting text spill
          // onto the colored ball outside the cream circle.
          //
          // EPIC 047: the disc itself (82%) is untouched — only its inner
          // safe area changed. A flat `px-3.5 py-2.5` (14px/10px) let a
          // wrapped paragraph's own rectangular box reach ~80% of the
          // disc's diameter — comfortably past the ~70.7% a rectangle can
          // occupy before its own corners cross a circle's curved edge, so
          // multi-line text visibly crowded the cream circle's boundary
          // near its top/bottom rows. `p-[18%]` is a *percentage* padding —
          // per the CSS spec, `padding` percentages always resolve against
          // the containing block's *width*, on every side, so on this
          // square (`w`==`h`) disc it insets top/bottom by the same amount
          // as left/right — leaving a concentric ~64%-of-diameter content
          // box (0.64/√2 ≈ 45% of the radius from center to a corner,
          // comfortably inside the 50% circle boundary) that scales with
          // the disc at every card size, not a fixed pixel gap that shrinks
          // in relative terms as the card grows. Paired with the smaller
          // `dense`/`compact` tiers below (lib/textScale.ts, re-tuned for
          // this narrower box), real DOM measurement (`scrollHeight` vs.
          // the disc's fixed `clientHeight`) confirms MESSAGE_MAX_LENGTH
          // content still fits with no clipping — `overflow-hidden` stays a
          // safety net, never an active truncation.
          <div className="flex h-[82%] w-[82%] flex-col items-center justify-center gap-1 overflow-hidden rounded-full bg-paper-cream p-[18%] text-center shadow-inner">
            <p
              lang={note.language}
              className={cn(
                // EPIC 045: `items-center` on this flex-col disc doesn't
                // stretch its children to the disc's width the way the
                // standard (non-football) card's wrapper does — without an
                // explicit width cap, a flex item with no cross-axis stretch
                // sizes to its own max-content width, so `break-words`
                // (overflow-wrap: break-word) never gets a constrained box
                // to actually wrap inside — confirmed by a real 150-char
                // unbroken-run stress test spilling the text far outside the
                // disc/card entirely. `max-w-full` caps the paragraph at the
                // disc's own rendered width, giving break-words something to
                // wrap against, exactly like the standard shape's
                // full-width wrapper already does implicitly.
                "max-w-full break-words text-ink",
                textScaleClass,
                fontFamilyClass
              )}
            >
              {note.content}
            </p>
            <span className="max-w-full break-words text-[0.65rem] text-ink-soft">— {note.authorName}</span>
          </div>
        ) : (
          <>
            <p
              lang={note.language}
              className={cn(
                // BUG FIX (same audit as the clip-path fix above): a single
                // word longer than the card's own width — a long German
                // compound, a URL, anything with no natural break point —
                // doesn't wrap under the browser's default `overflow-wrap:
                // normal`; it overflows the box instead, and since this
                // element sits inside the shape's own clip-path, that overflow
                // was silently cut off rather than visibly spilling out
                // (confirmed: "Verantwortungsbewusstsein" lost its own tail on
                // a real clip-path template). `break-words` lets a genuinely
                // unbreakable word wrap mid-word as a last resort, matching
                // the PDF renderer's own guaranteed-fit text handling
                // (pdfTextMeasure.ts) — never truncated/hidden, always visible.
                "break-words text-ink",
                textScaleClass,
                fontFamilyClass
              )}
            >
              {note.content}
            </p>
            <span className="break-words text-xs text-ink-soft">— {note.authorName}</span>
          </>
        )}
      </div>
      {!isImageBacked && template.attachment === "tape" && (
        <span
          aria-hidden="true"
          className="absolute -top-3 left-1/2 h-6 w-14 -translate-x-1/2 -rotate-2 rounded-[2px] bg-white/60 ring-1 ring-black/5"
        />
      )}
      {!isImageBacked && template.attachment === "pin" && (
        <span
          aria-hidden="true"
          className="absolute -top-2 left-1/2 h-4 w-4 -translate-x-1/2 rounded-full bg-orange ring-2 ring-white/70"
        />
      )}
      {!isImageBacked && renderNoteDecoration(template.decoration)}
      {note.authorImage && (
        // Decorative: the visible "— name" text already conveys identity,
        // so this doesn't need its own screen-reader announcement. Small,
        // circular, tucked at the corner — the thought is larger than the
        // person who wrote it. Plain <img>, not next/image: these are tiny
        // (28px) decorative avatars from arbitrary Google profile URLs —
        // not worth a next.config.ts remotePatterns entry or LCP budget.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={note.authorImage}
          alt=""
          referrerPolicy="no-referrer"
          loading="lazy"
          className="absolute -bottom-2 -right-2 h-7 w-7 rounded-full border-2 border-surface object-cover shadow-card"
        />
      )}
      {like && (
        <button
          type="button"
          onClick={like.liked ? undefined : like.onLike}
          // "world"/"board" notes sit inside InfiniteBoard's pan/drag
          // container, which starts its own gesture on pointerdown
          // (including setPointerCapture on itself) for canvas panning.
          // Without stopping propagation here, a mouse click on this
          // button gets swallowed by that gesture handling before the
          // browser's synthesized click ever fires — confirmed by real
          // testing (touch taps worked, simulated mouse clicks silently
          // did nothing). Touch never had this problem since it doesn't
          // go through the same pointer-capture path the same way.
          onPointerDown={(event) => event.stopPropagation()}
          disabled={like.liked}
          aria-pressed={like.liked}
          aria-label={like.liked ? like.likedLabel : like.label}
          className="absolute -bottom-2 -left-2 flex items-center gap-1 rounded-pill border border-border/70 bg-surface px-2 py-0.5 text-[10px] font-medium text-ink-soft shadow-card transition-colors hover:text-orange-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange disabled:cursor-default"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            className={cn("h-3 w-3 shrink-0", like.liked ? "fill-orange stroke-orange" : "fill-none stroke-current")}
            strokeWidth={1.5}
          >
            <path d="M8 13.5S2 9.8 2 6.1C2 4 3.6 2.5 5.5 2.5c1.2 0 2.1.6 2.5 1.5.4-.9 1.3-1.5 2.5-1.5C12.4 2.5 14 4 14 6.1c0 3.7-6 7.4-6 7.4Z" />
          </svg>
          {like.count}
        </button>
      )}
      {actions.length > 0 && (
        // Inset at the card's own top-right corner — never overflows the
        // card's box (attachment/decoration already own top-center/
        // top-left, so this corner is free), unlike the earlier version's
        // text pills floating *above* the card. That matters beyond looks:
        // an always-inset control needs no extra placement-footprint
        // margin at all, where the old overflowing row did — see
        // features/board/lib/placement.ts's DECORATIVE_OVERFLOW_PX for the
        // (smaller, still-real) margin the remaining overflowing elements
        // — attachment/decoration/avatar/like — still need.
        //
        // BUG FIX: real-device mobile QA found these buttons only
        // intermittently reachable on a touchscreen — confirmed as a
        // touch-hover reveal problem, not a card-selection or business-rule
        // bug: `pointer-coarse:opacity-100` below (Tailwind v4's built-in
        // `pointer: coarse` media variant) makes save/share/report always
        // visible on a touchscreen, exactly like the like button already
        // is, regardless of hover/focus state. `hover:`/`group-hover:`/
        // `group-focus-within:`/`focus-visible:` alone are a mouse-only
        // discovery model — a touchscreen has no true `:hover`, so whether
        // a tap grants any of them a transient hover/focus state is a
        // browser/OS quirk (WebKit's well-known tap-hover behavior, which
        // never focuses a `<button>` on tap at all), not something this app
        // controls — which is why only one of three visually-identical
        // buttons was ever reachable. Desktop's mouse hover/focus reveal is
        // untouched by this addition.
        //
        // BUG FIX (EPIC 028): visibility alone (above) turned out not to be
        // the whole story — live testing (Chrome touch-pointer simulation,
        // and geometry inspection of the real rendered card) shows these
        // three 28px buttons sit only 4px apart, with the *last* one
        // ("Bildir"/report) flush against the card's own right edge (its
        // box ends ~8px from the card boundary). Apple/Google's touch
        // target guidance is ~44px; at 28px with a finger's much larger
        // contact area, a tap that lands even slightly past a button's
        // true box — most likely for report, which has the least margin
        // before falling off the card entirely onto InfiniteBoard's own
        // pan surface — misses the link/button and is read as the start of
        // a board drag instead of a tap, while save (leftmost, most
        // interior to the card) has the most slack and so "wins" most
        // often. `pointer-coarse:h-9 pointer-coarse:w-9`/`gap-1.5` below
        // enlarge the tappable box and its spacing on a touchscreen only
        // (mouse/desktop keeps the original 28px/4px sizing) — the icon
        // glyph itself is unchanged, so desktop's quiet visual weight is
        // untouched; only the touch hit-area grows.
        //
        // BUG FIX (EPIC 029): the real defect wasn't visibility or sizing —
        // an unrevealed button (`opacity-0`) still defaulted to
        // `pointer-events: auto`, and its box measurably overlaps the
        // note's own paragraph (confirmed via getBoundingClientRect() on a
        // live card: ~85×25px of real overlap, since a short note's text
        // naturally sits near this same top-right corner). Painted after
        // the text in DOM order, that invisible box silently won every
        // click in the overlap region — tapping what looked like plain
        // card text actually hit save (leftmost, closest to the text)
        // underneath. `pointer-events-none` below makes an unrevealed
        // button transparent to clicks (falling through to the text/
        // background exactly as a user would expect), and each
        // `*:pointer-events-auto` re-enables it in lockstep with the exact
        // same condition that already restores its opacity — mouse hover,
        // keyboard focus, or a touchscreen — so nothing that could already
        // reveal an action loses the ability to click it.
        //
        // EPIC 040: on a touchscreen specifically, that "always visible"
        // reveal used to be unconditional (`pointer-coarse:opacity-100`
        // with no other condition) — confirmed to be exactly what was
        // permanently covering a short note's own text on a phone. Now
        // gated by the `active` prop (see each button's className below):
        // still driven by the same `pointer-coarse:` media variant (so
        // desktop's mouse hover/keyboard-focus reveal, both unconditional,
        // are completely untouched by this), but touch only reveals the
        // one board-wide "active" card's actions, set by tapping the card
        // itself (`onActivate` on the `<article>` above).
        <div className="absolute top-2 right-2 flex gap-1 pointer-coarse:gap-1.5">
          {actions.map((action) => (
            <div key={action.href ?? action.label} className="group/action relative">
              {action.onClick ? (
                <button
                  type="button"
                  aria-label={action.label}
                  onClick={action.onClick}
                  // Same fix as the like button above — without this, a
                  // click here gets swallowed by InfiniteBoard's own
                  // pan-gesture handling on "world" notes before the click
                  // ever registers (confirmed by real testing, not assumed).
                  onPointerDown={(event) => event.stopPropagation()}
                  // pointer-coarse:backdrop-blur-none — on a touchscreen
                  // these buttons are permanently visible (see
                  // pointer-coarse:opacity-100 below), not a transient hover
                  // reveal like on desktop, so every one of them recomposites
                  // its backdrop-filter on every board-pan frame. bg-surface/90
                  // is already near-opaque, so the blur added negligible
                  // legibility there while being one of the most expensive
                  // properties to paint on mobile GPUs — dropped for touch
                  // only; desktop's transient hover appearance is unchanged.
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full bg-surface/90 text-ink-soft opacity-0 pointer-events-none shadow-card ring-1 ring-border/60 backdrop-blur-sm transition-opacity duration-[var(--motion-fast)] hover:text-navy focus-visible:opacity-100 focus-visible:pointer-events-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto pointer-coarse:h-9 pointer-coarse:w-9 pointer-coarse:backdrop-blur-none",
                    // EPIC 040: touch reveal is conditional on this being
                    // the board's one active card — see the div comment
                    // above.
                    active && "pointer-coarse:opacity-100 pointer-coarse:pointer-events-auto"
                  )}
                >
                  {actionIcons[action.icon]}
                </button>
              ) : (
                <Link
                  href={action.href!}
                  aria-label={action.label}
                  // Same fix as the like button above — without this, a mouse
                  // click here gets swallowed by InfiniteBoard's own
                  // pan-gesture handling on "world" notes before navigation
                  // fires (confirmed by real testing, not assumed).
                  onPointerDown={(event) => event.stopPropagation()}
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full bg-surface/90 text-ink-soft opacity-0 pointer-events-none shadow-card ring-1 ring-border/60 backdrop-blur-sm transition-opacity duration-[var(--motion-fast)] hover:text-navy focus-visible:opacity-100 focus-visible:pointer-events-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto pointer-coarse:h-9 pointer-coarse:w-9 pointer-coarse:backdrop-blur-none",
                    // EPIC 040: same conditional touch reveal as the button variant above.
                    active && "pointer-coarse:opacity-100 pointer-coarse:pointer-events-auto"
                  )}
                >
                  {actionIcons[action.icon]}
                </Link>
              )}
              {/* Hover/focus-only label — `aria-hidden` because the link's
                  own `aria-label` above already carries this text as the
                  accessible name; this span is a purely visual affordance
                  (and correctly absent from touch, which has no hover). */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-sm bg-navy px-1.5 py-1 text-[10px] font-medium text-white opacity-0 shadow-card transition-opacity duration-[var(--motion-fast)] group-hover/action:opacity-100 group-focus-within/action:opacity-100"
              >
                {action.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
