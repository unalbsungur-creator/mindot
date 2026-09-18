import { create, type Font } from "fontkit";
import type { NoteTextFontFamily } from "@/features/notes/types";
import { readPublicAsset } from "@/features/sharing/services/publicAsset";

/**
 * Real glyph-metrics text measurement and manual line-wrapping for the PDF
 * Memory Print — replaces reliance on `@react-pdf/textkit`'s own automatic
 * word-wrap for user-generated content, which was confirmed (rendered and
 * rasterized) to have two distinct, independent failure modes once
 * hyphenation is disabled (`Font.registerHyphenationCallback((word) =>
 * [word])` in fonts.ts — required, since the default dictionary corrupts
 * text; see CLAUDE.md's "Every" -> "very" defect):
 *
 * 1. A single word wider than the box's remaining inner width has nowhere
 *    valid to break, so textkit hard-splits it mid-character instead of
 *    overflowing or wrapping it whole ("Schöne Grüße aus München." wrapped
 *    as "...aus M" / "ünchen." — the card's real Caveat glyph metrics at
 *    that font size needed more than the ~312pt inner width available, a
 *    per-word case a flat chars-per-line heuristic can't catch).
 *
 * 2. Independently, and more surprisingly: even when EVERY individual word
 *    fits the box on its own, textkit's own greedy line-fill can still
 *    choose a mid-word breakpoint for the last word of a line when adding
 *    it whole would only *narrowly* overflow — confirmed directly:
 *    "Aşkım seni çok seviyorum." on the exact same card geometry as a
 *    "Kalite asla tesadüf değildir." control (same width, font, position)
 *    wrapped "değildir." whole to line 2 (correct — it would have
 *    overflowed line 1 by ~42pt) but hard-split "seviyorum." into "s" /
 *    "eviyorum" (wrong — "seviyorum." alone measures 131.5pt, comfortably
 *    under the box's ~293pt safety budget; only the narrower ~17pt overflow
 *    of *adding it to a part-filled line 1* differs between the two
 *    cases). A single trailing space (glue after the string's own final
 *    word) does not reliably prevent this — it was verified to fix some
 *    strings and not others, so it is not a real fix for this failure mode.
 *
 * Both are defects in react-pdf's own line-breaking once hyphenation is
 * off, not something a caller can reliably work around by tweaking the
 * input string. The robust fix used throughout this renderer
 * (noteCardPdf.tsx, renderer.tsx) is to never hand textkit an ambiguous
 * multi-word line to wrap at all: `wrapTextToLines` below pre-computes
 * every line break itself, using the exact same font file this PDF embeds
 * (fontkit is already a real transitive dependency of `@react-pdf/renderer`
 * — the same library its own text layout uses internally), and the result
 * is joined with explicit `\n`s before ever reaching a react-pdf `<Text>`.
 * `safeTextScale` remains the necessary complement for failure mode 1: even
 * a manually-wrapped single-word line still needs the box to actually be
 * wide enough for that one word, so a caller shrinks font size first when
 * the content's widest word wouldn't fit at all.
 */

/**
 * EPIC — Kart Yazı Tipi Seçenekleri: now keyed by the writer's chosen
 * `fontFamily` rather than the template's `font` — every font a note's
 * text can render in gets real glyph-metrics measurement, not just the
 * original two.
 */
export type PdfMeasureFont = NoteTextFontFamily;

/**
 * P0 hotfix (production PDF 500s — EPIC: PDF Worker Font Bundling): same
 * defect and same fix as fonts.ts's `ensurePdfFontsRegistered` — this used
 * to `fontkit.openSync(path.join(process.cwd(), "src/features/.../assets/
 * fonts", ...))`, which throws `no such file or directory` in the deployed
 * Cloudflare Worker (OpenNext's file tracer can't resolve a `process.cwd()`-
 * built path). Found only by grepping the built Worker bundle for this
 * literal path — the original crash in `ensurePdfFontsRegistered` always
 * threw first, so this second, independent occurrence never actually ran
 * in production until that one was fixed. Same remedy: read the same
 * `public/fonts/share/*.woff` bytes via `readPublicAsset`, then hand
 * fontkit the bytes directly (`create`, not `openSync`) instead of a path.
 */
const FONT_PATHS: Record<PdfMeasureFont, string> = {
  modern: "/fonts/share/NotoSans-Regular.woff",
  classic: "/fonts/share/Fraunces-Regular.woff",
  handwritten: "/fonts/share/Caveat-Regular.woff",
  typewriter: "/fonts/share/GeistMono-Regular.woff",
};

const fontCache = new Map<PdfMeasureFont, Font>();
let preloadPromise: Promise<void> | null = null;

/**
 * Must be awaited (once, before the first PDF render — see `pdf.tsx`'s
 * `generateMemoryPdf`) before `widestWordWidthPt`/`safeTextScale`/
 * `wrapTextToLines` below are called: those stay synchronous (they run
 * mid-JSX-construction in `noteCardPdf.tsx`/`renderer.tsx`, not inside an
 * async render pass), so the actual byte fetch has to happen ahead of time
 * into this module's cache rather than on first use.
 */
export function ensurePdfMeasureFontsLoaded(): Promise<void> {
  if (!preloadPromise) {
    preloadPromise = Promise.all(
      (Object.keys(FONT_PATHS) as PdfMeasureFont[]).map(async (font) => {
        const bytes = await readPublicAsset(FONT_PATHS[font]);
        // These are always single WOFF files, never a TTC/OTC collection —
        // the same files fonts.ts embeds — so this cast is exact, not speculative.
        fontCache.set(font, create(Buffer.from(bytes)) as Font);
      })
    )
      .then(() => undefined)
      .catch((error) => {
        preloadPromise = null;
        throw error;
      });
  }
  return preloadPromise;
}

function loadFont(font: PdfMeasureFont): Font {
  const loaded = fontCache.get(font);
  if (!loaded) {
    throw new Error(`PDF measure font "${font}" used before ensurePdfMeasureFontsLoaded() resolved — call it in generateMemoryPdf first.`);
  }
  return loaded;
}

function measureWidthPt(loaded: Font, text: string, fontSizePt: number): number {
  return (loaded.layout(text).advanceWidth / loaded.unitsPerEm) * fontSizePt;
}

export function widestWordWidthPt(text: string, font: PdfMeasureFont, fontSizePt: number): number {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0 || fontSizePt <= 0) return 0;
  const loaded = loadFont(font);
  let max = 0;
  for (const word of words) {
    const width = measureWidthPt(loaded, word, fontSizePt);
    if (width > max) max = width;
  }
  return max;
}

/**
 * The largest scale (never above `geometryScale`) at which every word in
 * `text` fits within `innerWidthPt`, given a font whose nominal size at
 * `geometryScale === 1` is `baseFontSizePt`. `safety` (default 0.94)
 * mirrors this codebase's existing print-safety-margin convention (see
 * `PDF_HEIGHT_SAFETY_FACTOR`'s doc comment in noteCardPdf.tsx) rather than
 * cutting it exactly at the theoretical limit. Guards failure mode 1 above
 * — pair with `wrapTextToLines` (failure mode 2) for full protection.
 */
export function safeTextScale(text: string, font: PdfMeasureFont, baseFontSizePt: number, geometryScale: number, innerWidthPt: number, safety = 0.94): number {
  const widest = widestWordWidthPt(text, font, baseFontSizePt * geometryScale);
  const budget = Math.max(1, innerWidthPt) * safety;
  if (widest <= budget || widest <= 0) return geometryScale;
  return geometryScale * (budget / widest);
}

/**
 * Standard greedy line-wrapping (accumulate words while they fit, break
 * before the first one that doesn't), computed once with real glyph
 * metrics so react-pdf never has to make its own wrap decision on this
 * text — see this file's doc comment for why that decision isn't reliable
 * once hyphenation is disabled. Preserves the input's own explicit `\n`
 * paragraph breaks. Call with `fontSizePt` already reduced by
 * `safeTextScale` when applicable, so a lone word that's still wider than
 * `maxWidthPt` (this function puts it alone on its own line rather than
 * ever splitting it) is guaranteed to actually fit, not just be isolated.
 */
export function wrapTextToLines(text: string, font: PdfMeasureFont, fontSizePt: number, maxWidthPt: number): string[] {
  const loaded = loadFont(font);
  const spaceWidth = measureWidthPt(loaded, " ", fontSizePt) || fontSizePt * 0.25;
  const lines: string[] = [];

  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let current = "";
    let currentWidth = 0;
    for (const word of words) {
      const wordWidth = measureWidthPt(loaded, word, fontSizePt);
      const withWord = current ? currentWidth + spaceWidth + wordWidth : wordWidth;
      if (current && withWord > maxWidthPt) {
        lines.push(current);
        current = word;
        currentWidth = wordWidth;
      } else {
        current = current ? `${current} ${word}` : word;
        currentWidth = withWord;
      }
    }
    lines.push(current);
  }
  return lines;
}
