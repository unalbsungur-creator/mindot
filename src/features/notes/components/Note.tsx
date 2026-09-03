import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { getNoteTemplate } from "../config/templates";
import type { NoteData, NoteDecoration } from "../types";

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
 * EPIC: Özel Günler İçin Tercih Edilebilir Post-it Tasarımları. One small,
 * inline SVG per occasion — plain shapes/paths coloring from the existing
 * design tokens only (no hardcoded hex, no image assets), rendered at a
 * fixed tiny size in a note's otherwise-unused top-left corner (pin/tape
 * sit top-center, the like button and avatar sit at the bottom corners,
 * the preserve/share actions row sits top-center) so decoration never
 * competes with the note's own text for attention.
 */
const decorationIcons: Record<NoteDecoration, ReactNode> = {
  confetti: (
    <svg viewBox="0 0 20 20" className="h-full w-full">
      <circle cx="4" cy="5" r="1.6" className="fill-orange" />
      <rect x="10.5" y="3" width="3" height="3" rx="0.5" className="fill-navy-soft" transform="rotate(20 12 4.5)" />
      <circle cx="15" cy="9" r="1.3" className="fill-orange-soft" />
      <rect x="4" y="11" width="2.6" height="2.6" rx="0.5" className="fill-navy-soft" transform="rotate(-15 5.3 12.3)" />
      <circle cx="11" cy="15" r="1.4" className="fill-orange" />
    </svg>
  ),
  hearts: (
    <svg viewBox="0 0 20 20" className="h-full w-full fill-orange">
      <path d="M10 16.5S3.5 12.2 3.5 7.6C3.5 5 5.5 3 8 3c1 0 1.9.5 2 1.5C10.1 3.5 11 3 12 3c2.5 0 4.5 2 4.5 4.6 0 4.6-6.5 8.9-6.5 8.9Z" />
    </svg>
  ),
  florals: (
    <svg viewBox="0 0 20 20" className="h-full w-full">
      <circle cx="10" cy="6" r="2.2" className="fill-orange-soft" />
      <circle cx="14.5" cy="10" r="2.2" className="fill-orange-soft" />
      <circle cx="10" cy="14" r="2.2" className="fill-orange-soft" />
      <circle cx="5.5" cy="10" r="2.2" className="fill-orange-soft" />
      <circle cx="10" cy="10" r="2" className="fill-orange-ink" />
    </svg>
  ),
  compass: (
    <svg viewBox="0 0 20 20" fill="none" className="h-full w-full stroke-navy" strokeWidth="1.4">
      <circle cx="10" cy="10" r="7" />
      <path d="M10 3v2.4M10 14.6V17M3 10h2.4M14.6 10H17" />
      <path d="M10 6.5 12 10l-2 3.5L8 10Z" className="fill-orange stroke-none" />
    </svg>
  ),
  snowflake: (
    <svg viewBox="0 0 20 20" fill="none" className="h-full w-full stroke-navy-soft" strokeWidth="1.4" strokeLinecap="round">
      <path d="M10 2v16M2.7 6l14.6 8M2.7 14l14.6-8" />
    </svg>
  ),
  "graduation-cap": (
    <svg viewBox="0 0 20 20" className="h-full w-full">
      <path d="M10 3 18 7l-8 4-8-4Z" className="fill-navy" />
      <path d="M6 9v3.5c0 1.1 1.8 2 4 2s4-.9 4-2V9L10 11Z" className="fill-navy-soft" />
      <path d="M17 7v4" className="stroke-orange" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="17" cy="11.6" r="1" className="fill-orange" />
    </svg>
  ),
  sparkle: (
    <svg viewBox="0 0 20 20" className="h-full w-full fill-orange">
      <path d="M10 2c.4 3.6 1.4 4.6 5 5-3.6.4-4.6 1.4-5 5-.4-3.6-1.4-4.6-5-5 3.6-.4 4.6-1.4 5-5Z" />
      <circle cx="15.5" cy="4.5" r="1" className="fill-orange-soft" />
    </svg>
  ),
  stars: (
    <svg viewBox="0 0 20 20" className="h-full w-full">
      <path
        d="M8 2c.35 2.6 1.15 3.4 3.7 3.75C9.15 6.1 8.35 6.9 8 9.5c-.35-2.6-1.15-3.4-3.7-3.75C6.85 5.4 7.65 4.6 8 2Z"
        className="fill-orange-soft"
      />
      <path
        d="M14.5 9c.25 1.9.85 2.5 2.7 2.75-1.85.25-2.45.85-2.7 2.75-.25-1.9-.85-2.5-2.7-2.75 1.85-.25 2.45-.85 2.7-2.75Z"
        className="fill-navy-soft"
      />
    </svg>
  ),
};

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
}

export function Note({ note, variant = "board", actions = [], like }: NoteProps) {
  const template = getNoteTemplate(note.templateId);
  const isHeart = template.shape === "heart";
  // `note.id` is already unique per rendered note (real message id, or a
  // stable "template-preview-<id>"/"preview" id for picker/write-flow
  // previews) — reused as the clip-path id's uniqueness source rather than
  // introducing a new prop, so many heart notes can render on one page
  // (e.g. TemplatePicker's grid) without colliding SVG ids.
  const heartClipId = isHeart ? `note-heart-${note.id}` : undefined;

  return (
    <article
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
        variant === "board" &&
          "sm:absolute sm:top-[var(--note-top)] sm:left-[var(--note-left)] sm:rotate-[var(--note-rotate)]",
        variant === "static" && "rotate-[var(--note-rotate)]",
        variant === "world" &&
          "z-[var(--z-note)] top-[var(--note-top)] left-[var(--note-left)] rotate-[var(--note-rotate)]",
        "transition-transform duration-[var(--motion-base)] ease-[var(--ease-standard)]",
        "hover:-translate-y-1 hover:z-[var(--z-note-hover)]",
        variant === "board" && "sm:hover:rotate-0",
        sizeClasses[note.size]
      )}
      style={
        {
          "--note-top": note.position.top,
          "--note-left": note.position.left,
          "--note-rotate": `${note.rotation}deg`,
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
          isHeart ? "justify-center px-7 pb-10 pt-7" : "p-4",
          paperClasses[template.paper],
          !isHeart && shapeClasses[template.shape]
        )}
        style={heartClipId ? { clipPath: `url(#${heartClipId})` } : undefined}
      >
        {template.shape === "polaroid" && (
          <span aria-hidden="true" className="-mx-4 -mt-4 mb-1 block h-24 bg-navy/10" />
        )}
        {template.shape === "folded" && (
          <span
            aria-hidden="true"
            className="absolute right-0 top-0 h-5 w-5 bg-surface [clip-path:polygon(100%_0,0_0,100%_100%)]"
          />
        )}
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
            "break-words text-[0.95rem] leading-snug text-ink",
            template.font === "hand" && "font-hand text-lg leading-tight"
          )}
        >
          {note.content}
        </p>
        <span className="break-words text-xs text-ink-soft">— {note.authorName}</span>
      </div>
      {template.attachment === "tape" && (
        <span
          aria-hidden="true"
          className="absolute -top-3 left-1/2 h-6 w-14 -translate-x-1/2 -rotate-2 rounded-[2px] bg-white/60 ring-1 ring-black/5"
        />
      )}
      {template.attachment === "pin" && (
        <span
          aria-hidden="true"
          className="absolute -top-2 left-1/2 h-4 w-4 -translate-x-1/2 rounded-full bg-orange ring-2 ring-white/70"
        />
      )}
      {template.decoration && (
        <span aria-hidden="true" className="absolute -top-1.5 -left-1.5 h-5 w-5">
          {decorationIcons[template.decoration]}
        </span>
      )}
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
        <div className="absolute top-2 right-2 flex gap-1">
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
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-surface/90 text-ink-soft opacity-0 shadow-card ring-1 ring-border/60 backdrop-blur-sm transition-opacity duration-[var(--motion-fast)] hover:text-navy focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange group-hover:opacity-100 group-focus-within:opacity-100"
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
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-surface/90 text-ink-soft opacity-0 shadow-card ring-1 ring-border/60 backdrop-blur-sm transition-opacity duration-[var(--motion-fast)] hover:text-navy focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange group-hover:opacity-100 group-focus-within:opacity-100"
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
