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
import { noteTextSizeTier, type NoteTextSizeTier } from "./textScale";
import type { NoteTextFontFamily } from "../types";

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

/**
 * EPIC 047: keyed by the writer's own font choice (`NoteTextFontFamily`) and
 * `NoteTextSizeTier`, not `NoteTemplate.font` — that template field is only
 * paper/shape design metadata and, since "Kart Yazı Tipi Seçenekleri",
 * `Note.tsx` no longer consults it to render a message's actual text (see
 * that file's own comment). Estimating from it here was a real drift bug:
 * a "sans"-tagged template written in the much larger/taller `handwritten`
 * font underestimated its own rendered height, which is exactly the kind
 * of gap the placement collision system (`placement.ts`) can't compensate
 * for — it only ever sees whatever footprint it's handed. These numbers are
 * a plain-px mirror of `textScale.ts`'s `STANDARD_TEXT_SCALE` font-size/
 * line-height pairs (144px usable width — `BASE_WIDTH` minus
 * `STANDARD_PADDING_Y`'s horizontal twin, `p-4` — divided by an average
 * per-character width for each family's glyph style) and must be kept in
 * sync with that table if its tiers ever change, the same documented-mirror
 * relationship `features/memories/services/pdfPalette.ts` already has with
 * `tokens.css`.
 */
const FONT_METRICS: Record<NoteTextFontFamily, Record<NoteTextSizeTier, { charsPerLine: number; lineHeight: number }>> = {
  modern: {
    default: { charsPerLine: 18, lineHeight: 21 },
    compact: { charsPerLine: 21, lineHeight: 19 },
    dense: { charsPerLine: 24, lineHeight: 17 },
  },
  // Fraunces: a display serif, marginally wider per glyph than Geist at the
  // same nominal size.
  classic: {
    default: { charsPerLine: 18, lineHeight: 21 },
    compact: { charsPerLine: 20, lineHeight: 19 },
    dense: { charsPerLine: 23, lineHeight: 17 },
  },
  // Caveat script — wider, taller glyphs than either proportional font above.
  handwritten: {
    default: { charsPerLine: 15, lineHeight: 23 },
    compact: { charsPerLine: 17, lineHeight: 22 },
    dense: { charsPerLine: 19, lineHeight: 20 },
  },
  // Geist Mono — fixed advance width, visibly wider per character than a
  // proportional font at the same declared size.
  typewriter: {
    default: { charsPerLine: 17, lineHeight: 19 },
    compact: { charsPerLine: 20, lineHeight: 17 },
    dense: { charsPerLine: 23, lineHeight: 15 },
  },
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
 * Estimates the rendered (width, height) of a note for the given template,
 * content, and the writer's own chosen text font, in the same world-px
 * units `TILE_PX` is measured in. `fontFamily` defaults to `"modern"` —
 * the same fallback `Note.tsx` and the `messages.fontFamily` column already
 * use for pre-existing data (see `Message.fontFamily`'s own doc comment).
 */
export function estimateNoteFootprint(
  templateId: string,
  content: string,
  fontFamily: NoteTextFontFamily = "modern"
): NoteFootprint {
  const template = getNoteTemplate(templateId);
  const isHeart = template.shape === "heart";
  const isPolaroid = template.shape === "polaroid";
  const isFootball = template.shape === "football";

  // EPIC 047: the football shape's `aspect-square overflow-hidden` (see
  // Note.tsx) is a hard clamp on the real rendered card, not a floor a
  // taller estimate could ever legitimately exceed — the inner cream disc
  // simply shrinks its own text instead of growing the card. Reporting the
  // fixed square unconditionally (rather than `Math.max(estimated,
  // BASE_WIDTH)`, which let a long message inflate the *collision*
  // footprint past the card's real, always-square rendered size) keeps
  // this in sync with what a sports card can actually collide with.
  if (isFootball) {
    return { width: BASE_WIDTH, height: BASE_WIDTH };
  }

  const tier = noteTextSizeTier(content.length);
  const metrics = FONT_METRICS[fontFamily][tier];

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
