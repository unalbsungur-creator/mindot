/**
 * A note's approximate rendered footprint (world/CSS pixels), for board
 * placement collision math only — never for rendering itself. `Note.tsx`
 * remains the single source of truth for actual layout; this is a
 * best-effort estimate of what it will produce, derived from the same
 * inputs Note.tsx itself uses (`NoteTemplate.shape`/`font` from the
 * existing registry, plus the message's own content length).
 *
 * Deliberately not pixel-perfect (text reflow, kerning, and the exact
 * font metrics aren't reproduced) — board placement only needs a
 * reasonably safe bounding box to keep notes from covering each other,
 * not a layout engine. See CLAUDE.md's "Duvar Kart Yerleşimi" fix notes
 * for why: `noteTemplates`' existing `shape`/`font` fields already fully
 * determine every CSS-driven footprint deviation Note.tsx has (the heart
 * shape's forced aspect ratio, the polaroid shape's extra image block,
 * the hand font's wider/taller glyphs) — no new template field was
 * needed to make this estimate reliable.
 */
import { getNoteTemplate } from "../config/templates";

export interface NoteFootprint {
  /** World px at zoom = 1 — matches Note.tsx's fixed "md" board/world size. */
  width: number;
  height: number;
}

/** Tailwind `w-44` (11rem @ 16px root) — the fixed width every board/world note renders at (`size: "md"`, the only size InfiniteBoard ever uses). */
const BASE_WIDTH = 176;

/** `p-4` top+bottom (16px + 16px). */
const STANDARD_PADDING_Y = 32;

/** Heart shape uses `px-7 pt-7 pb-10` — 28px top + 40px bottom. */
const HEART_PADDING_Y = 68;

/** `gap-3` between the content `<p>` and the "— author" `<span>`. */
const CONTENT_TO_AUTHOR_GAP = 12;

/** `text-xs` (0.75rem/1rem line-height) author line, plus a little breathing room for descenders. */
const AUTHOR_LINE_HEIGHT = 20;

/**
 * Polaroid's shape class adds `pb-8` (32px) over the standard shape, and
 * the component itself renders an extra `-mx-4 -mt-4 mb-1 h-24` image
 * block above the content (96px tall, 16px of which overlaps the
 * existing top padding, plus 4px margin) — net addition over the
 * standard footprint.
 */
const POLAROID_EXTRA_HEIGHT = 32 + (96 - 16 + 4);

/** Longest a thought can be (`MESSAGE_MAX_LENGTH`) still only clamps to this many estimated lines, so one very long message can't blow up the whole tile's layout. */
const MAX_ESTIMATED_LINES = 8;

const FONT_METRICS: Record<"sans" | "hand", { charsPerLine: number; lineHeight: number }> = {
  // 176px width - 32px padding = 144px available; ~8px/char average at 15.2px sans.
  sans: { charsPerLine: 18, lineHeight: 21 },
  // font-hand + text-lg (18px) + leading-tight — wider, taller glyphs than sans.
  hand: { charsPerLine: 15, lineHeight: 23 },
};

function estimateLineCount(content: string, charsPerLine: number): number {
  const segments = content.split("\n");
  let lines = 0;
  for (const segment of segments) {
    lines += Math.max(1, Math.ceil(segment.length / charsPerLine));
  }
  return Math.min(Math.max(lines, 1), MAX_ESTIMATED_LINES);
}

/**
 * Estimates the rendered (width, height) of a note for the given template
 * and content, in the same world-px units `TILE_PX` is measured in.
 */
export function estimateNoteFootprint(templateId: string, content: string): NoteFootprint {
  const template = getNoteTemplate(templateId);
  const isHeart = template.shape === "heart";
  const isPolaroid = template.shape === "polaroid";
  const metrics = FONT_METRICS[template.font];

  const lines = estimateLineCount(content, metrics.charsPerLine);
  const paddingY = isHeart ? HEART_PADDING_Y : STANDARD_PADDING_Y;
  let height = paddingY + lines * metrics.lineHeight + CONTENT_TO_AUTHOR_GAP + AUTHOR_LINE_HEIGHT;

  if (isHeart) {
    // `aspect-[4/5]` forces height to at least width * 5/4, regardless of content.
    height = Math.max(height, BASE_WIDTH * 1.25);
  }
  if (isPolaroid) {
    height += POLAROID_EXTRA_HEIGHT;
  }

  return { width: BASE_WIDTH, height: Math.round(height) };
}
