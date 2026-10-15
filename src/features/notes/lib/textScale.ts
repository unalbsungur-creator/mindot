import type { NoteTemplate, NoteTextFontFamily } from "../types";

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

/** A three-tier table extended to all five tiers: the two short tiers keep the "default" size. */
function withShortTiers<T>(table: Record<NoteTextFontFamily, Record<"default" | "compact" | "dense", T>>): Record<NoteTextFontFamily, Record<NoteTextSizeTier, T>> {
  return Object.fromEntries(
    Object.entries(table).map(([font, tiers]) => [font, { xlarge: tiers.default, large: tiers.default, ...tiers }])
  ) as Record<NoteTextFontFamily, Record<NoteTextSizeTier, T>>;
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

/** Note.tsx's standard (non-football) content paragraph — heart shares this too, since only football renders text inside a smaller inset disc. */
const STANDARD_TEXT_SCALE = withShortTiers<string>({
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
  serif: {
    default: "text-[0.95rem] leading-snug",
    compact: "text-[0.85rem] leading-snug",
    dense: "text-[0.75rem] leading-snug",
  },
  mono: {
    default: "text-[0.85rem] leading-snug",
    compact: "text-[0.75rem] leading-snug",
    dense: "text-[0.65rem] leading-snug",
  },
  elegant: {
    default: "text-[0.95rem] leading-snug",
    compact: "text-[0.85rem] leading-snug",
    dense: "text-[0.75rem] leading-snug",
  },
  bold: {
    default: "text-[0.95rem] leading-snug",
    compact: "text-[0.85rem] leading-snug",
    dense: "text-[0.75rem] leading-snug",
  },
});

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
const IMAGE_BACKED_TEXT_SCALE = withShortTiers<string>({
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
    dense: "text-[0.54rem] leading-none",
  },
  typewriter: {
    default: "text-[0.62rem] leading-tight",
    compact: "text-[0.46rem] leading-tight",
    dense: "text-[0.4rem] leading-none",
  },
  // The variants below are wider than their base family (heavier glyphs,
  // or Elegant's letter spacing), so they step down a notch in this tight box.
  serif: {
    default: "text-[0.56rem] leading-tight",
    compact: "text-[0.52rem] leading-tight",
    dense: "text-[0.44rem] leading-none",
  },
  mono: {
    default: "text-[0.62rem] leading-tight",
    compact: "text-[0.46rem] leading-tight",
    dense: "text-[0.4rem] leading-none",
  },
  elegant: {
    default: "text-[0.54rem] leading-tight",
    compact: "text-[0.5rem] leading-tight",
    dense: "text-[0.42rem] leading-none",
  },
  bold: {
    default: "text-[0.55rem] leading-tight",
    compact: "text-[0.51rem] leading-tight",
    dense: "text-[0.43rem] leading-none",
  },
});

/**
 * Image-backed templates with `contentTextSize: "spacious"` (the new
 * Standard cards, e.g. "standard-classic") — their clean region is most of
 * the card, so text sits close to a plain note's size instead of the tiny
 * Special Day tiers above.
 *
 * Sized in `cqw` of the card (Note.tsx makes the spacious card's wrapper an
 * `@container`, and sets this size inline — `spaciousTextSizeCqw`), not rem:
 * the text box is a fixed share of a card whose width changes (w-36 on a
 * phone's world view, w-44 elsewhere), so a fixed rem size that fits at
 * 176px overflows at 144px — measured. In cqw the text keeps exactly the
 * card's proportions at every width, which is also how the share card and
 * PDF scale it (`spaciousTextSizePx` in
 * features/sharing/services/noteCardSatori.tsx derives its px from these
 * same numbers: `px = cqw × 176 / 100`). The author line is `0.85em` of
 * these (see Note.tsx), as in the share card.
 *
 * "default"/"compact"/"dense": each is just under the largest size at which
 * every test message of that tier — Turkish, ALL-CAPS Turkish, German, and
 * a run of very long words, up to the tier's length limit — still fits the
 * "standard-classic" text box with 5% headroom, measured in the real DOM per
 * font (computed `offsetHeight` of text + author vs. the box's
 * `clientHeight`). Because the unit is cqw, that holds at every card width.
 *
 * "large" (≤ 60) and "xlarge" (≤ 30) scale that measured "default" up — by
 * 1.1 / 1.45 — rather than replacing it (1.2 for "large" let 60 ALL-CAPS
 * characters fill the whole "standard-classic" box, rendered): real-glyph measurement (fontkit, the
 * PDF's own `pdfTextMeasure.ts`) of the same test messages over the
 * smallest Standard box gives ≥ 1.16 / ≥ 1.5 more room at those lengths than
 * at 90, for every font.
 */
const SPACIOUS_IMAGE_BACKED_TEXT_SCALE: Record<NoteTextFontFamily, Record<NoteTextSizeTier, number>> = {
  modern: { xlarge: 10.3, large: 7.81, default: 7.1, compact: 5.7, dense: 5.5 },
  classic: { xlarge: 10, large: 7.59, default: 6.9, compact: 5.5, dense: 5.3 },
  handwritten: { xlarge: 11.6, large: 8.8, default: 8.0, compact: 6.9, dense: 6.4 },
  typewriter: { xlarge: 9.57, large: 7.26, default: 6.6, compact: 5.55, dense: 5.5 },
  serif: { xlarge: 9.72, large: 7.37, default: 6.7, compact: 5.35, dense: 5.1 },
  // Geist Mono Bold keeps the regular weight's fixed advance width.
  mono: { xlarge: 9.57, large: 7.26, default: 6.6, compact: 5.55, dense: 5.5 },
  elegant: { xlarge: 9.14, large: 6.93, default: 6.3, compact: 5, dense: 4.9 },
  bold: { xlarge: 9.72, large: 7.37, default: 6.7, compact: 5.35, dense: 5.2 },
};

/** Line height of a spacious card's text (and its author line): `leading-snug`, Caveat `leading-tight`. */
export function spaciousLineHeight(fontFamily: NoteTextFontFamily): number {
  return fontFamily === "handwritten" ? 1.25 : 1.375;
}

/**
 * Average advance per character (em) of each font over mixed Turkish/German
 * text, measured with the real WOFFs (fontkit) — only for the line estimate
 * in `spaciousTextFit`, never for layout.
 */
const AVERAGE_CHAR_EM: Record<NoteTextFontFamily, number> = {
  modern: 0.503,
  classic: 0.506,
  handwritten: 0.361,
  typewriter: 0.6,
  serif: 0.521,
  mono: 0.6,
  elegant: 0.566,
  bold: 0.531,
};

/**
 * Extra shrink (≤ 1) of a spacious card's length-tier size for a message
 * with the writer's own line breaks: the largest size at which its
 * estimated lines plus the author line fit the template's measured
 * `contentArea` with 5% headroom. In cqw of the card, so the result is the
 * same for the DOM, the share card and the PDF at every width. A message
 * without a line break keeps exactly its measured tier size (1).
 *
 * The line estimate — average character width, capitals counted 1.3 wide,
 * two characters a wrapped line loses to its last word — was calibrated
 * against real glyph wrapping (fontkit, `pdfTextMeasure.ts`) of Turkish,
 * ALL-CAPS and German multi-line messages on every Standard card and font:
 * it never allowed a size the measured text didn't fit, and came within
 * ~1.5% of the measured largest size on average.
 */
export function spaciousTextFit(content: string, fontFamily: NoteTextFontFamily, template: NoteTemplate): number {
  const area = template.contentArea;
  if (!content.includes("\n") || !area || !template.imageWidth || !template.imageHeight) return 1;
  const boxWidth = parseFloat(area.width);
  const boxHeight = ((parseFloat(area.height) * template.imageHeight) / template.imageWidth) * 0.95;
  const lineHeight = spaciousLineHeight(fontFamily);
  const charEm = AVERAGE_CHAR_EM[fontFamily];
  // Each paragraph's width in average characters, capitals counted 1.3 wide.
  const paragraphs = content.split("\n").map((p) => [...p].reduce((sum, ch) => sum + (ch !== ch.toLowerCase() ? 1.3 : 1), 0));
  const base = SPACIOUS_IMAGE_BACKED_TEXT_SCALE[fontFamily][noteTextLengthTier(content)];
  const fits = (size: number) => {
    const charsPerLine = Math.max(1, Math.floor(boxWidth / (charEm * size)));
    const lines = paragraphs.reduce((sum, chars) => sum + (chars <= charsPerLine ? 1 : Math.ceil(chars / Math.max(1, charsPerLine - 2))), 0);
    const author = size * 0.5 + size * 0.85 * lineHeight;
    return lines * size * lineHeight + author <= boxHeight;
  };
  let fit = 1;
  // No floor that real text could hit: 150 characters can be 75 one-character lines.
  while (fit > 0.05 && !fits(base * fit)) fit -= 0.01;
  return Math.round(fit * 100) / 100;
}

/** A spacious card's text size in cqw of the card: its length tier's measured size, times `spaciousTextFit` for text with line breaks. */
export function spaciousTextSizeCqw(content: string, fontFamily: NoteTextFontFamily, template: NoteTemplate): number {
  const size = SPACIOUS_IMAGE_BACKED_TEXT_SCALE[fontFamily][noteTextLengthTier(content)] * spaciousTextFit(content, fontFamily, template);
  return Math.round(size * 1000) / 1000;
}

/** The raw tier table, for tests. */
export const SPACIOUS_TEXT_SIZE_CQW = SPACIOUS_IMAGE_BACKED_TEXT_SCALE;

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
const FOOTBALL_TEXT_SCALE = withShortTiers<string>({
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
  serif: {
    default: "text-[0.52rem] leading-[1.25]",
    compact: "text-[0.4rem] leading-[1.2]",
    dense: "text-[0.34rem] leading-[1.1]",
  },
  mono: {
    default: "text-[0.46rem] leading-[1.2]",
    compact: "text-[0.38rem] leading-[1.15]",
    dense: "text-[0.32rem] leading-[1.05]",
  },
  elegant: {
    default: "text-[0.5rem] leading-[1.25]",
    compact: "text-[0.39rem] leading-[1.2]",
    dense: "text-[0.33rem] leading-[1.1]",
  },
  bold: {
    default: "text-[0.55rem] leading-[1.25]",
    compact: "text-[0.43rem] leading-[1.2]",
    dense: "text-[0.37rem] leading-[1.1]",
  },
});

/**
 * The font-size/line-height class for this content length + font choice —
 * `noteFontFamilyClass` (above) is the separate font-*family* class; the
 * two are always applied together (see Note.tsx) but kept as separate
 * functions since one depends on content length and the other doesn't.
 */
export function noteTextScaleClass(
  content: string,
  fontFamily: NoteTextFontFamily,
  context: "standard" | "football" | "imageBacked" | "imageBackedSpacious"
): string {
  // Spacious: only the leading — the size is inline (`spaciousTextSizeCqw`),
  // since it can be fitted below its tier for text with line breaks.
  if (context === "imageBackedSpacious") return fontFamily === "handwritten" ? "leading-tight" : "leading-snug";
  const tier = noteTextSizeTier(content, context === "standard" ? STANDARD_LINE_BREAK_WEIGHT : LINE_BREAK_WEIGHT);
  const table = context === "football" ? FOOTBALL_TEXT_SCALE : context === "imageBacked" ? IMAGE_BACKED_TEXT_SCALE : STANDARD_TEXT_SCALE;
  return table[fontFamily][tier];
}

/** The football disc's message size in rem (read from FOOTBALL_TEXT_SCALE's `text-[…rem]`), for capping the author line at it. */
export function footballTextSizeRem(content: string, fontFamily: NoteTextFontFamily): number {
  const match = /text-\[([\d.]+)rem\]/.exec(FOOTBALL_TEXT_SCALE[fontFamily][noteTextSizeTier(content)]);
  return match ? Number(match[1]) : 0.65;
}
