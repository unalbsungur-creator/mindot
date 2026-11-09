/**
 * Where the brand slogan ("AKLINDA KALMASIN.", "NE LE GARDE PAS POUR TOI.", …)
 * breaks and how large it is drawn — shared by every PDF template
 * (memories/services/renderer.tsx) and every share image
 * (sharing/services/shareCardRenderer.tsx, brandOgImage.tsx), so the slogan
 * never wraps on its own wherever a renderer happens to run out of room.
 *
 * The rule, in order:
 *   1. One centred line at the design's own size.
 *   2. Still one line, stepping the size down by `SLOGAN_SCALE_STEP` — never
 *      below `SLOGAN_MIN_SCALE` (at most 20% smaller).
 *   3. Two balanced lines (the split whose wider line is narrowest), starting
 *      again from the design's size and stepping down the same way. The
 *      bottom line never holds a single word on its own while the slogan has
 *      three or more words.
 * The last word is always the orange accent (`tail` of the last line).
 *
 * Pure: the caller supplies `measure` (real glyph metrics — `measureTextWidth`
 * in pdfTextMeasure.ts — plus its own letter spacing), so this is testable
 * without fonts and identical for react-pdf and Satori.
 */

export const SLOGAN_MIN_SCALE = 0.8;
export const SLOGAN_SCALE_STEP = 0.05;

/** One drawn line: `head` in the ink colour, `tail` (the slogan's last word, last line only) in orange. */
export interface SloganLine {
  head: string;
  tail: string;
}

export interface SloganLayout {
  fontSize: number;
  lines: SloganLine[];
  /** False only when even the smallest allowed size overflows `maxWidth` on two lines — the caller still draws it at `fontSize`. */
  fits: boolean;
}

export interface SloganLayoutOptions {
  /** The design's own slogan size. */
  fontSize: number;
  /** The width the slogan must stay inside, same unit as `fontSize`. */
  maxWidth: number;
  /** Width of `text` drawn at `fontSize`, letter spacing included. */
  measure: (text: string, fontSize: number) => number;
}

/** The sizes tried, largest first: 1, 0.95, … 0.8 of `fontSize`. */
export function sloganScales(): number[] {
  const scales: number[] = [];
  const steps = Math.round((1 - SLOGAN_MIN_SCALE) / SLOGAN_SCALE_STEP);
  for (let i = 0; i <= steps; i += 1) scales.push(Number((1 - i * SLOGAN_SCALE_STEP).toFixed(4)));
  return scales;
}

function toLines(rows: string[][]): SloganLine[] {
  return rows.map((words, index) =>
    index === rows.length - 1 ? { head: words.slice(0, -1).join(" "), tail: words[words.length - 1] ?? "" } : { head: words.join(" "), tail: "" }
  );
}

/** The two-line split whose wider line is narrowest; the bottom line keeps ≥ 2 words whenever the slogan has ≥ 3. */
export function balancedSloganSplit(words: string[], measure: (text: string) => number): [string[], string[]] | null {
  if (words.length < 2) return null;
  const minBottom = words.length >= 3 ? 2 : 1;
  let best: [string[], string[]] | null = null;
  let bestWidth = Infinity;
  for (let k = 1; k <= words.length - minBottom; k += 1) {
    const top = words.slice(0, k);
    const bottom = words.slice(k);
    const width = Math.max(measure(top.join(" ")), measure(bottom.join(" ")));
    if (width < bestWidth) {
      bestWidth = width;
      best = [top, bottom];
    }
  }
  return best;
}

export function layoutSlogan(slogan: string, { fontSize, maxWidth, measure }: SloganLayoutOptions): SloganLayout {
  const words = slogan.trim().split(/\s+/).filter(Boolean);
  const text = words.join(" ");
  const scales = sloganScales();

  for (const scale of scales) {
    const size = fontSize * scale;
    if (measure(text, size) <= maxWidth) return { fontSize: size, lines: toLines([words]), fits: true };
  }

  const split = balancedSloganSplit(words, (line) => measure(line, fontSize));
  if (!split) {
    return { fontSize: fontSize * SLOGAN_MIN_SCALE, lines: toLines([words]), fits: false };
  }
  for (const scale of scales) {
    const size = fontSize * scale;
    if (split.every((line) => measure(line.join(" "), size) <= maxWidth)) return { fontSize: size, lines: toLines(split), fits: true };
  }
  return { fontSize: fontSize * SLOGAN_MIN_SCALE, lines: toLines(split), fits: false };
}
