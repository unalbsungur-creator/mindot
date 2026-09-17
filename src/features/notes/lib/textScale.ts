import type { NoteTextFontFamily } from "../types";

/**
 * EPIC 045: Kart Metin Uzunluğu ve Boyut Standardizasyonu. A note's card
 * geometry (width, and — for the heart/football shapes — a fixed
 * aspect-ratio height) never changes with content; only the *typography*
 * inside it may. This maps a message's length (capped at
 * `MESSAGE_MAX_LENGTH`, see features/messages/types.ts) to one of a small
 * number of font-size/line-height tiers, applied identically everywhere
 * `Note.tsx` renders real content (board, write-flow preview, personal
 * wall, memory page's "lg" card) — a single shared source rather than
 * duplicating thresholds per caller.
 *
 * EPIC — Kart Yazı Tipi Seçenekleri: the tier tables are now keyed by
 * `NoteTextFontFamily` (the writer's own font choice) instead of the old
 * `template.font === "hand"` binary — the length-based tiering mechanism
 * itself is unchanged, only which typeface it's tuned for. `"modern"`'s
 * tiers are byte-identical to the old pre-this-EPIC "sans" values, so a
 * message that predates this feature (or a writer who just leaves the
 * default) renders exactly as before.
 */
export type NoteTextSizeTier = "default" | "compact" | "dense";

const COMPACT_THRESHOLD = 90;
const DENSE_THRESHOLD = 130;

/** `content.length` — plain UTF-16 length, matching the native `maxLength` attribute WriteThoughtForm's textarea already enforces (not the `[...content].length` code-point count `submitMessage`/the character counter use), since this only drives a visual tier and never a hard limit. */
export function noteTextSizeTier(contentLength: number): NoteTextSizeTier {
  if (contentLength > DENSE_THRESHOLD) return "dense";
  if (contentLength > COMPACT_THRESHOLD) return "compact";
  return "default";
}

/**
 * The Tailwind font-family utility for each choice — `"modern"` intentionally
 * omits an explicit class (the app's own `body` already sets `font-sans` as
 * its base font-family in globals.css, so "closest to the current look" is
 * the literal default, not a duplicate class). The other three reuse the
 * exact tokens already established elsewhere in this codebase:
 * `font-display` (Fraunces, the app's own heading font — see globals.css's
 * `--font-display`), `font-hand` (Caveat, already Note.tsx's pre-existing
 * hand-styled template font), `font-mono` (Geist Mono — added by this EPIC,
 * see globals.css's `--font-mono` and app/layout.tsx).
 */
export function noteFontFamilyClass(fontFamily: NoteTextFontFamily): string {
  switch (fontFamily) {
    case "classic":
      return "font-display";
    case "handwritten":
      return "font-hand";
    case "typewriter":
      return "font-mono";
    case "modern":
    default:
      return "";
  }
}

/** Note.tsx's standard (non-football) content paragraph — heart shares this too, since only football renders text inside a smaller inset disc. */
const STANDARD_TEXT_SCALE: Record<NoteTextFontFamily, Record<NoteTextSizeTier, string>> = {
  // Byte-identical to the pre-EPIC "sans" tier — the app's default look.
  modern: {
    default: "text-[0.95rem] leading-snug",
    compact: "text-[0.85rem] leading-snug",
    dense: "text-[0.75rem] leading-snug",
  },
  // Fraunces reads comfortably at the same sizes as Geist for body-length
  // text (it's a display serif, not an oversized script font like Caveat)
  // — same tier values as modern, kept as its own table for independent
  // tuning rather than aliasing.
  classic: {
    default: "text-[0.95rem] leading-snug",
    compact: "text-[0.85rem] leading-snug",
    dense: "text-[0.75rem] leading-snug",
  },
  // Byte-identical to the pre-EPIC "hand" tier — Caveat's already-tuned
  // larger sizing (a cursive script needs more room to stay legible).
  handwritten: {
    default: "text-lg leading-tight",
    compact: "text-base leading-snug",
    dense: "text-sm leading-snug",
  },
  // Smaller than modern at every tier: a monospace font's fixed advance
  // width makes it visibly wider per character than a proportional font at
  // the same declared size, so the same nominal size wraps to more lines —
  // stepping the whole table down keeps typewriter's *line count* (and
  // therefore card height growth) comparable to the other three fonts at
  // the same content length.
  typewriter: {
    default: "text-[0.85rem] leading-snug",
    compact: "text-[0.75rem] leading-snug",
    dense: "text-[0.65rem] leading-snug",
  },
};

/**
 * EPIC: Special Day Image-Backed Cards — an image-backed template's
 * `contentArea` (see types.ts) is a fixed, real-artwork-derived rectangle
 * that's deliberately smaller than a standard card's own padded box (it has
 * to fit inside the artwork's clean region without touching balloons/cake/
 * ribbons — see each template's own `contentArea` comment in
 * config/templates.ts), so reusing `STANDARD_TEXT_SCALE`'s sizes measurably
 * overflows the box at MESSAGE_MAX_LENGTH (confirmed by real DOM
 * measurement: the standard "dense" tier's author line rendered ~46px below
 * the content area's own bottom edge). Same idea as `FOOTBALL_TEXT_SCALE`
 * below (a smaller fixed box needs its own smaller tuned tiers, not a
 * scaled copy of standard's), tuned empirically against real short/medium/
 * long Turkish content in the browser rather than guessed.
 */
const IMAGE_BACKED_TEXT_SCALE: Record<NoteTextFontFamily, Record<NoteTextSizeTier, string>> = {
  modern: {
    default: "text-[0.58rem] leading-tight",
    compact: "text-[0.54rem] leading-tight",
    dense: "text-[0.46rem] leading-none",
  },
  classic: {
    default: "text-[0.58rem] leading-tight",
    compact: "text-[0.54rem] leading-tight",
    dense: "text-[0.46rem] leading-none",
  },
  handwritten: {
    default: "text-[0.92rem] leading-tight",
    compact: "text-[0.72rem] leading-tight",
    dense: "text-[0.58rem] leading-none",
  },
  typewriter: {
    default: "text-[0.62rem] leading-tight",
    compact: "text-[0.46rem] leading-tight",
    dense: "text-[0.4rem] leading-none",
  },
};

/**
 * Football's smaller inset disc — same tiering, scaled down from its own
 * (already smaller than standard) baseline. EPIC 046: `compact`/`dense`
 * tuned tighter than the standard table's own tiers — real DOM measurement
 * (`scrollHeight` vs. the disc's fixed `clientHeight`, see Note.tsx's
 * `overflow-hidden` disc) confirmed the original EPIC 045 sizes let
 * MESSAGE_MAX_LENGTH content outgrow the disc's fixed box, spilling onto
 * the colored ball outside the cream circle — never a geometry change
 * (that stays a fixed 82% of the card, see Note.tsx), only typography.
 *
 * EPIC — Kart Yazı Tipi Seçenekleri: `classic`/`typewriter` are tuned a
 * notch smaller than `modern` at every tier here specifically — the
 * football disc's usable area is small and fixed, so this is the one
 * context where a font's own width/weight characteristics (Fraunces'
 * display-weight glyphs, Geist Mono's fixed advance width) most risk
 * pushing real DOM overflow; verified empirically (see the QA report) with
 * real 150-char content, both realistic and an unbroken-run stress string.
 */
const FOOTBALL_TEXT_SCALE: Record<NoteTextFontFamily, Record<NoteTextSizeTier, string>> = {
  modern: {
    default: "text-[0.58rem] leading-[1.25]",
    compact: "text-[0.46rem] leading-[1.2]",
    dense: "text-[0.4rem] leading-[1.1]",
  },
  classic: {
    default: "text-[0.54rem] leading-[1.25]",
    compact: "text-[0.42rem] leading-[1.2]",
    dense: "text-[0.36rem] leading-[1.1]",
  },
  handwritten: {
    default: "text-[0.72rem] leading-[1.2]",
    compact: "text-[0.56rem] leading-[1.12]",
    dense: "text-[0.44rem] leading-[1.02]",
  },
  typewriter: {
    default: "text-[0.46rem] leading-[1.2]",
    compact: "text-[0.38rem] leading-[1.15]",
    dense: "text-[0.32rem] leading-[1.05]",
  },
};

/**
 * The font-size/line-height class for this content length + font choice —
 * `noteFontFamilyClass` (above) is the separate font-*family* class; the
 * two are always applied together (see Note.tsx) but kept as separate
 * functions since one depends on content length and the other doesn't.
 */
export function noteTextScaleClass(
  contentLength: number,
  fontFamily: NoteTextFontFamily,
  context: "standard" | "football" | "imageBacked"
): string {
  const tier = noteTextSizeTier(contentLength);
  const table =
    context === "football" ? FOOTBALL_TEXT_SCALE : context === "imageBacked" ? IMAGE_BACKED_TEXT_SCALE : STANDARD_TEXT_SCALE;
  return table[fontFamily][tier];
}
