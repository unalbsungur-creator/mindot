import type { CSSProperties } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { getNoteTemplate } from "../config/templates";
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
   */
  actions?: { href: string; label: string }[];
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

  return (
    <article
      className={cn(
        "group relative flex shrink-0 flex-col gap-3 p-4",
        variant === "board" &&
          "sm:absolute sm:top-[var(--note-top)] sm:left-[var(--note-left)] sm:rotate-[var(--note-rotate)]",
        variant === "static" && "rotate-[var(--note-rotate)]",
        variant === "world" &&
          "z-[var(--z-note)] absolute top-[var(--note-top)] left-[var(--note-left)] rotate-[var(--note-rotate)]",
        "shadow-note transition-transform duration-[var(--motion-base)] ease-[var(--ease-standard)]",
        "hover:-translate-y-1 hover:shadow-note-hover hover:z-[var(--z-note-hover)]",
        variant === "board" && "sm:hover:rotate-0",
        paperClasses[template.paper],
        shapeClasses[template.shape],
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
          "text-[0.95rem] leading-snug text-ink",
          template.font === "hand" && "font-hand text-lg leading-tight"
        )}
      >
        {note.content}
      </p>
      <span className="text-xs text-ink-soft">— {note.authorName}</span>
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
        <div className="absolute -top-2.5 left-1/2 flex -translate-x-1/2 gap-1">
          {actions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              // Same fix as the like button above — without this, a mouse
              // click here gets swallowed by InfiniteBoard's own
              // pan-gesture handling on "world" notes before navigation
              // fires (confirmed by real testing, not assumed).
              onPointerDown={(event) => event.stopPropagation()}
              className="rounded-pill border border-border/70 bg-surface px-2.5 py-0.5 text-[10px] font-medium text-ink-soft opacity-0 shadow-card transition-opacity duration-[var(--motion-fast)] hover:text-navy focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange group-hover:opacity-100 group-focus-within:opacity-100"
            >
              {action.label}
            </Link>
          ))}
        </div>
      )}
    </article>
  );
}
