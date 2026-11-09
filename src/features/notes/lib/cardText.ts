import { getNoteTemplate } from "../config/templates";
import type { NoteTemplate, NoteTextFontFamily } from "../types";
import { NOTE_FONT_ADVANCES, NOTE_FONT_CHARSET } from "./noteFontMetrics.generated";
import { noteTextSizeTier, STANDARD_LINE_BREAK_WEIGHT } from "./textScale";

/**
 * The one card-text rule — how big a note's message is, where its lines
 * break, and how its signature ("— name", or a quote's "— author" plus
 * "shared by") sits — for every surface that draws a card: the board and
 * every preview (`Note.tsx`), and the share images and PDFs
 * (`MemoryNoteCard`, noteCardSatori.tsx). Pure and synchronous: it measures
 * with one glyph-width table generated from the real font files
 * (`noteFontMetrics.generated.ts`), so the DOM, Satori and the PDF all get
 * the same size and the same line breaks.
 *
 * Every number here is in px at the card's baseline width
 * (`CARD_BASELINE_WIDTH`, Tailwind `w-44`); a surface scales them by its own
 * width (the DOM as `cqw` of the card, Satori as `width / 176`).
 *
 * The rule:
 * - Fixed-box cards (the image cards, the football disc, the heart): the
 *   signature is reserved at the bottom of the box first, then the message
 *   gets the LARGEST size at which its wrapped lines fit what is left —
 *   never above the box's `maxPx` (a word or three must not fill the card)
 *   nor below its `minPx` (150 characters must stay readable; the tests
 *   check every template fits 150 characters at `minPx`).
 * - Growing cards (paper notes whose height follows their text): the size is
 *   the length tier it always had — the board's placement footprint
 *   (footprint.ts) is built on it — with the same signature rules. The share
 *   image and PDF draw its computed lines; the DOM lets the browser break
 *   them in the font it draws (`text-wrap: pretty` against a lone last
 *   word), since Geist runs ~3% narrower than the measured Noto Sans and
 *   lines measured wider would make the card taller than its footprint.
 * - Lines are broken with real widths, into the fewest lines and among those
 *   the evenest: no word stranded on a short line, and a paragraph of three
 *   or more words never ends on a single word when another break with the
 *   same line count avoids it. A word wider than the box is split rather
 *   than overflowing.
 * - The signature is one line, at a fixed small size that is never larger
 *   than the smallest size the message itself can have on that card; if it
 *   doesn't fit it shrinks in steps (to 80%), then ends in "…". A quote's
 *   "shared by" line is smaller still (`SHARER_SCALE`).
 */

/** Tailwind `w-44` — the width every number in this module is expressed at. */
export const CARD_BASELINE_WIDTH = 176;

/** A quote's "shared by" line relative to its author line. */
export const SHARER_SCALE = 0.85;
/** The signature shrinks to at most this before it is cut with "…". */
export const BYLINE_MIN_SCALE = 0.8;
const BYLINE_SCALE_STEP = 0.05;
/** A signature line's height relative to its size. */
export const BYLINE_LINE_HEIGHT = 1.3;
/** Space between the message and the signature, relative to the signature size. */
export const BYLINE_GAP = 0.6;
/** Lines are broken this much inside the box. The DOM's own fonts measure at most 0.2% wider than this table (measured in Chrome; Geist runs ~3% narrower than Noto Sans), Satori draws the very fonts measured — so 1% keeps every computed line from re-wrapping. */
const WIDTH_MARGIN = 0.99;
/** Lines are stacked into at most this share of the room left for them, so the DOM's line-box rounding never spills a pixel. */
export const HEIGHT_MARGIN = 0.97;
/** Size search step, px at the baseline width. */
const SIZE_STEP = 0.25;

// ---------------------------------------------------------------------------
// Measuring
// ---------------------------------------------------------------------------

type MetricsFace = keyof typeof NOTE_FONT_ADVANCES;

const FONT_FACES: Record<NoteTextFontFamily, { face: MetricsFace; trackingEm: number }> = {
  modern: { face: "modern", trackingEm: 0 },
  bold: { face: "bold", trackingEm: 0 },
  classic: { face: "classic", trackingEm: 0 },
  serif: { face: "serif", trackingEm: 0 },
  // Fraunces with the DOM's `tracking-[0.06em]`.
  elegant: { face: "classic", trackingEm: 0.06 },
  handwritten: { face: "handwritten", trackingEm: 0 },
  typewriter: { face: "typewriter", trackingEm: 0 },
  // Geist Mono Bold keeps the regular weight's fixed advance width.
  mono: { face: "typewriter", trackingEm: 0 },
};

/** A character none of the tables cover (an emoji, a script outside Latin): drawn by a fallback font, counted wide. */
const UNKNOWN_CHAR_EM = 1.15;

let advanceTables: Record<MetricsFace, Map<number, number>> | null = null;

function tables(): Record<MetricsFace, Map<number, number>> {
  if (!advanceTables) {
    const codePoints = [...NOTE_FONT_CHARSET].map((ch) => ch.codePointAt(0)!);
    advanceTables = Object.fromEntries(
      Object.entries(NOTE_FONT_ADVANCES).map(([face, values]) => {
        const map = new Map<number, number>();
        values.split(",").forEach((value, index) => {
          const advance = Number(value);
          if (advance > 0) map.set(codePoints[index], advance / 1000);
        });
        return [face, map];
      })
    ) as Record<MetricsFace, Map<number, number>>;
  }
  return advanceTables;
}

/** `text`'s width at `px` in the note font `font` ("byline": the signature's Noto Sans / Geist). */
export function measureCardText(text: string, font: NoteTextFontFamily | "byline", px: number): number {
  const { face, trackingEm } = font === "byline" ? FONT_FACES.modern : FONT_FACES[font];
  const all = tables();
  let em = 0;
  let count = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    em += all[face].get(cp) ?? all.modern.get(cp) ?? UNKNOWN_CHAR_EM;
    count += 1;
  }
  return (em + trackingEm * count) * px;
}

// ---------------------------------------------------------------------------
// Line breaking
// ---------------------------------------------------------------------------

/** Splits a word wider than `maxWidth` into pieces that fit. */
function splitLongWord(word: string, font: NoteTextFontFamily, px: number, maxWidth: number): string[] {
  const pieces: string[] = [];
  let current = "";
  for (const ch of word) {
    if (current && measureCardText(current + ch, font, px) > maxWidth) {
      pieces.push(current);
      current = ch;
    } else {
      current += ch;
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

/**
 * One paragraph's lines: the fewest lines the box allows (what the fit's
 * height depends on), and among those the evenest — no word stranded on a
 * short line in the middle, and the last line never a single word when the
 * paragraph has three or more words and another break avoids it. Dynamic
 * programming over the break points (a paragraph is at most 150 characters).
 */
function wrapParagraph(paragraph: string, font: NoteTextFontFamily, px: number, maxWidth: number): string[] {
  const words = paragraph
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((word) => (measureCardText(word, font, px) > maxWidth ? splitLongWord(word, font, px, maxWidth) : [word]));
  const n = words.length;
  if (n === 0) return [""];
  const space = measureCardText(" ", font, px);
  const prefix = [0];
  for (const word of words) prefix.push(prefix[prefix.length - 1] + measureCardText(word, font, px));
  const lineWidth = (i: number, j: number) => prefix[j] - prefix[i] + space * (j - i - 1);
  const orphanPenalty = maxWidth * maxWidth * 4;

  // best[j]: the best way to set words[0..j) — fewest lines first, then least raggedness.
  const best: Array<{ lines: number; cost: number; from: number }> = [{ lines: 0, cost: 0, from: -1 }];
  for (let j = 1; j <= n; j++) {
    best[j] = { lines: Infinity, cost: Infinity, from: -1 };
    for (let i = j - 1; i >= 0; i--) {
      const width = lineWidth(i, j);
      if (width > maxWidth && j - i > 1) break;
      const isLast = j === n;
      const slack = maxWidth - width;
      const cost = isLast ? (j - i === 1 && n >= 3 ? orphanPenalty : 0) : slack * slack;
      const lines = best[i].lines + 1;
      const total = best[i].cost + cost;
      if (lines < best[j].lines || (lines === best[j].lines && total < best[j].cost)) best[j] = { lines, cost: total, from: i };
    }
  }
  const lines: string[] = [];
  for (let j = n; j > 0; j = best[j].from) lines.unshift(words.slice(best[j].from, j).join(" "));
  return lines;
}

/** `content`'s lines at `px` inside `maxWidth`, keeping the writer's own line breaks. */
export function wrapCardText(content: string, font: NoteTextFontFamily, px: number, maxWidth: number): string[] {
  return content.split("\n").flatMap((paragraph) => wrapParagraph(paragraph, font, px, maxWidth));
}

// ---------------------------------------------------------------------------
// Card geometry
// ---------------------------------------------------------------------------

export type CardTextKind = "spacious" | "compact" | "football" | "heart" | "growing";

export interface CardTextGeometry {
  kind: CardTextKind;
  /** The text box (message + signature) at the baseline width; `height: null` on a growing card. */
  box: { width: number; height: number | null };
  /** How wide the signature may run — narrower than the box only on the heart, whose point narrows. */
  bylineWidth: number;
  /** The message's size range for this card and font (`maxPx === minPx` on a growing card). */
  minPx: number;
  maxPx: number;
  /** The signature's size — never above the smallest message size any font can have on this card. */
  bylinePx: number;
  lineHeight: number;
}

/**
 * Size range per fixed-box kind, for the Noto Sans / Geist look ("modern");
 * a font that reads smaller at the same px scales it (`FONT_SIZE_FACTOR`).
 * `minPx` is the largest size at which 150 characters of the worst test text
 * still fit the smallest box of that kind (cardText.test.ts checks it).
 */
const KIND_BOUNDS: Record<Exclude<CardTextKind, "growing">, { minPx: number; maxPx: number }> = {
  spacious: { minPx: 8.75, maxPx: 19 },
  // The Special Day boxes are small (down to 77 × 84 px on Mother's Day Bloom).
  compact: { minPx: 5.5, maxPx: 12 },
  football: { minPx: 5.5, maxPx: 12 },
  heart: { minPx: 9, maxPx: 17 },
};

/** Caveat's small x-height reads a size smaller than the others at the same px. Never below 1, so the signature stays the smallest text. */
const FONT_SIZE_FACTOR: Partial<Record<NoteTextFontFamily, number>> = { handwritten: 1.15 };

/**
 * A growing card's message size by length tier, px — the DOM's long-standing
 * `text-[0.95rem]`/`0.85rem`/`0.75rem` steps (handwritten `text-lg`/`base`/
 * `sm`; the monospace fonts a step smaller), which footprint.ts mirrors.
 */
const GROWING_TIER_PX: Record<NoteTextFontFamily, { default: number; compact: number; dense: number }> = {
  modern: { default: 15.2, compact: 13.6, dense: 12 },
  classic: { default: 15.2, compact: 13.6, dense: 12 },
  serif: { default: 15.2, compact: 13.6, dense: 12 },
  elegant: { default: 15.2, compact: 13.6, dense: 12 },
  bold: { default: 15.2, compact: 13.6, dense: 12 },
  handwritten: { default: 18, compact: 16, dense: 14 },
  typewriter: { default: 13.6, compact: 12, dense: 10.4 },
  mono: { default: 13.6, compact: 12, dense: 10.4 },
};
/** The smallest growing-card message size (the monospace "dense" tier). */
const GROWING_BYLINE_PX = 10.4;

/** Growing card: 16px padding on both sides at the baseline width (`GROWING_PADDING`, drawn in cqw so it scales with the card). */
export const GROWING_PADDING = 16;
const GROWING_BOX_WIDTH = CARD_BASELINE_WIDTH - GROWING_PADDING * 2;
/**
 * Football: the cream disc is 82% of the card, inset by `p-[18%]` — a
 * percentage padding resolves against the card's width, not the disc's —
 * so its text area is 82% − 2 × 18% = 46% of the card, square.
 */
const FOOTBALL_BOX = CARD_BASELINE_WIDTH * (0.82 - 0.36);
/**
 * Heart (4:5 card, 176 × 220): the text box keeps clear of the top notch
 * between the lobes and of the sides as they curve in; the signature sits
 * where the point is ~74px wide (y ≈ 80% of the height, `HEART_PATH`).
 */
export const HEART_TEXT_BOX = { left: 38, right: 38, top: 40, bottom: 44 } as const;
const HEART_BYLINE_WIDTH = 70;

function lineHeightFor(kind: CardTextKind, fontFamily: NoteTextFontFamily): number {
  const handwritten = fontFamily === "handwritten";
  if (kind === "compact") return handwritten ? 1.05 : 1.15;
  if (kind === "football") return handwritten ? 1.15 : 1.25;
  return handwritten ? 1.25 : 1.375;
}

export function cardTextKind(template: NoteTemplate): CardTextKind {
  if (template.image && template.contentArea) return template.contentTextSize === "spacious" ? "spacious" : "compact";
  if (template.shape === "football") return "football";
  if (template.shape === "heart") return "heart";
  return "growing";
}

export function cardTextGeometry(template: NoteTemplate, fontFamily: NoteTextFontFamily, content = ""): CardTextGeometry {
  const kind = cardTextKind(template);
  const lineHeight = lineHeightFor(kind, fontFamily);
  if (kind === "growing") {
    const tier = noteTextSizeTier(content, STANDARD_LINE_BREAK_WEIGHT);
    const px = GROWING_TIER_PX[fontFamily][tier === "xlarge" || tier === "large" ? "default" : tier];
    return { kind, box: { width: GROWING_BOX_WIDTH, height: null }, bylineWidth: GROWING_BOX_WIDTH, minPx: px, maxPx: px, bylinePx: GROWING_BYLINE_PX, lineHeight };
  }
  const bounds = KIND_BOUNDS[kind];
  const factor = FONT_SIZE_FACTOR[fontFamily] ?? 1;
  let box: { width: number; height: number };
  let bylineWidth: number;
  if (kind === "football") {
    box = { width: FOOTBALL_BOX, height: FOOTBALL_BOX };
    bylineWidth = FOOTBALL_BOX;
  } else if (kind === "heart") {
    box = {
      width: CARD_BASELINE_WIDTH - HEART_TEXT_BOX.left - HEART_TEXT_BOX.right,
      height: CARD_BASELINE_WIDTH * 1.25 - HEART_TEXT_BOX.top - HEART_TEXT_BOX.bottom,
    };
    bylineWidth = HEART_BYLINE_WIDTH;
  } else {
    const area = template.contentArea!;
    const cardHeight = (CARD_BASELINE_WIDTH * template.imageHeight!) / template.imageWidth!;
    box = { width: (parseFloat(area.width) / 100) * CARD_BASELINE_WIDTH, height: (parseFloat(area.height) / 100) * cardHeight };
    bylineWidth = box.width;
  }
  return { kind, box, bylineWidth, minPx: bounds.minPx * factor, maxPx: bounds.maxPx * factor, bylinePx: bounds.minPx, lineHeight };
}

// ---------------------------------------------------------------------------
// The signature
// ---------------------------------------------------------------------------

export interface CardBylineLine {
  text: string;
  px: number;
}

/** One signature line inside `maxWidth`: at `px`, else shrunk in 5% steps to 80%, else cut with "…" at 80%. */
export function fitBylineLine(text: string, px: number, maxWidth: number): CardBylineLine {
  const limit = maxWidth * WIDTH_MARGIN;
  for (let scale = 1; scale >= BYLINE_MIN_SCALE - 1e-9; scale -= BYLINE_SCALE_STEP) {
    const size = Math.round(px * scale * 1000) / 1000;
    if (measureCardText(text, "byline", size) <= limit) return { text, px: size };
  }
  const size = px * BYLINE_MIN_SCALE;
  const chars = [...text];
  let keep = chars.length;
  while (keep > 1 && measureCardText(`${chars.slice(0, keep).join("").trimEnd()}…`, "byline", size) > limit) keep -= 1;
  return { text: `${chars.slice(0, keep).join("").trimEnd()}…`, px: size };
}

/** Rows a signature takes: its lines (author line, and a quote's "shared by" line). */
export interface CardBylineRows {
  /** Has a main line ("— name", or a quote's "— author"). */
  main: boolean;
  /** Has a quote's smaller "shared by" line. */
  sharer: boolean;
}

/** Height the signature takes at the bottom of the box, including the gap above it. */
export function bylineReserve(geometry: CardTextGeometry, rows: CardBylineRows): number {
  if (!rows.main && !rows.sharer) return 0;
  const px = geometry.bylinePx;
  return px * BYLINE_GAP + (rows.main ? px * BYLINE_LINE_HEIGHT : 0) + (rows.sharer ? px * SHARER_SCALE * BYLINE_LINE_HEIGHT : 0);
}

// ---------------------------------------------------------------------------
// The layout
// ---------------------------------------------------------------------------

export interface CardTextLayout {
  geometry: CardTextGeometry;
  /** The message size, px at the baseline width. */
  fontSize: number;
  lineHeight: number;
  /** The message, already broken into lines — draw them as they are. */
  lines: string[];
  /** Height of the message block (lines × line height). */
  textHeight: number;
  /** Signature reserve at the box bottom (gap included). */
  bylineReserve: number;
  /** False only if even `minPx` overflows the box (a fixed-box card can't grow). */
  fits: boolean;
}

export interface CardTextInput {
  templateId: string;
  /** The text as drawn (`noteDisplayContent`). */
  content: string;
  fontFamily: NoteTextFontFamily;
  rows: CardBylineRows;
}

const cache = new Map<string, CardTextLayout>();
const CACHE_LIMIT = 500;

export function layoutCardText({ templateId, content, fontFamily, rows }: CardTextInput): CardTextLayout {
  const key = `${templateId}\u0000${fontFamily}\u0000${rows.main ? 1 : 0}${rows.sharer ? 1 : 0}\u0000${content}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const geometry = cardTextGeometry(getNoteTemplate(templateId), fontFamily, content);
  const reserve = bylineReserve(geometry, rows);
  const maxWidth = geometry.box.width * WIDTH_MARGIN;
  const { lineHeight } = geometry;

  let fontSize = geometry.minPx;
  let lines = wrapCardText(content, fontFamily, fontSize, maxWidth);
  let fits = true;
  if (geometry.box.height !== null) {
    const available = (geometry.box.height - reserve) * HEIGHT_MARGIN;
    fits = false;
    for (let px = geometry.maxPx; px >= geometry.minPx - 1e-9; px -= SIZE_STEP) {
      const candidate = wrapCardText(content, fontFamily, px, maxWidth);
      if (candidate.length * px * lineHeight <= available) {
        fontSize = px;
        lines = candidate;
        fits = true;
        break;
      }
    }
  }

  const layout: CardTextLayout = { geometry, fontSize, lineHeight, lines, textHeight: lines.length * fontSize * lineHeight, bylineReserve: reserve, fits };
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  cache.set(key, layout);
  return layout;
}

/** `px` at the baseline width as `cqw` of the card — how the DOM draws every size above. */
export function cardCqw(px: number): string {
  return `${Math.round((px / CARD_BASELINE_WIDTH) * 100 * 1000) / 1000}cqw`;
}
