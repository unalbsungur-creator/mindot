import type { NoteTextFontFamily } from "../types";

/**
 * Since the card-text fit (lib/cardText.ts) the message's size on every
 * card comes from `layoutCardText`; this module keeps the length tiers a
 * growing card's size and the board footprint (footprint.ts) are built on,
 * and the font-family classes.
 *
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
export type NoteTextSizeTier = "xlarge" | "large" | "default" | "compact" | "dense";

const XLARGE_THRESHOLD = 30;
const LARGE_THRESHOLD = 60;
const COMPACT_THRESHOLD = 90;
const DENSE_THRESHOLD = 130;
/**
 * What one of the writer's own line breaks costs in `noteTextSizeTier`, on
 * a card with no fit of its own (see `noteTextLengthTier` for the ones that
 * have one). A fixed box — the DOM's football disc and Special Day
 * `contentArea` — needs a full line (a standard card's 144px box holds ~18
 * characters a line at the default size): measured with real glyph
 * wrapping over 31 multi-line messages × 8 fonts, half a line (9) let
 * noticeably more of them overflow those boxes than 18 did (football
 * 26 vs. 18 of 248, Special Day 732 vs. 531 of 1984, at w-44).
 */
export const LINE_BREAK_WEIGHT = 18;

/**
 * The standard card (and its board footprint, `footprint.ts`) grows with
 * its text, so a break can't make it overflow — it only costs the room it
 * leaves unused on average, half a line.
 */
export const STANDARD_LINE_BREAK_WEIGHT = 9;

/**
 * The size tier for a message on a card that has no fit of its own (the
 * DOM's standard, Special Day and football text, and the board footprint
 * that mirrors the standard card): its length (`content.length`, plain
 * UTF-16 — matching the textarea's native `maxLength`; this only drives a
 * visual tier, never a limit) plus `lineBreakWeight` per line break, so
 * text with breaks never gets a larger tier than the same text on one
 * line, and more breaks never a larger one. Text without a break is tiered
 * by length alone, at the same 90/130 boundaries as before; "xlarge"
 * (≤ 30) and "large" (≤ 60) split the old "default" for short text — only
 * the fixed-box Standard cards (SPACIOUS_IMAGE_BACKED_TEXT_SCALE) size
 * them up, every other table keeps its "default" size for them.
 */
export function noteTextSizeTier(content: string, lineBreakWeight = LINE_BREAK_WEIGHT): NoteTextSizeTier {
  const lineBreaks = content.split("\n").length - 1;
  const weighted = content.length + lineBreaks * lineBreakWeight;
  if (weighted > DENSE_THRESHOLD) return "dense";
  if (weighted > COMPACT_THRESHOLD) return "compact";
  if (weighted > LARGE_THRESHOLD) return "default";
  if (weighted > XLARGE_THRESHOLD) return "large";
  return "xlarge";
}

/**
 * The size tier by length alone, for a card with a real fit for its lines
 * (`spaciousTextFit` for the Standard cards, `footballTextFitScale` for the
 * share card's football disc): the fit measures what the line breaks need,
 * so weighing them into the tier as well would shrink the text twice.
 */
export function noteTextLengthTier(content: string): NoteTextSizeTier {
  return noteTextSizeTier(content, 0);
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
    // Weight/spacing variants of the same four families — the share card
    // and PDF map each to the matching real WOFF weight (shareFonts.ts,
    // fonts.ts), never a synthesized bold.
    case "serif":
      return "font-display font-semibold";
    case "mono":
      return "font-mono font-bold";
    case "elegant":
      return "font-display tracking-[0.06em]";
    case "bold":
      return "font-bold";
    case "modern":
    default:
      return "";
  }
}
