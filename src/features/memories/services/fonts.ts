import { readFileSync } from "node:fs";
import path from "node:path";
import { Font } from "@react-pdf/renderer";

export const PDF_FONT_FAMILY = "Noto Sans";
/** The Memory Print's brand/heading font — matches Share's `BRAND_FONT_FAMILY` (Fraunces), used for the footer slogan line. */
export const PDF_BRAND_FONT_FAMILY = "Fraunces";
/** A hand-styled note's real font — matches Share's `HAND_FONT_FAMILY` (Caveat), used only when the note's template has `font: "hand"`. */
export const PDF_HAND_FONT_FAMILY = "Caveat";

let registered = false;

/**
 * Noto Sans, latin-ext subset — covers Turkish (ğşıöüçĞŞİÖÜÇ), German
 * (äöüßÄÖÜ), French, and Spanish diacritics in a single file (verified
 * directly with fontkit before committing this approach; see the EPIC 006
 * report). Fraunces/Caveat reuse the exact same glyph-verified WOFF assets
 * the Share renderer already loads (`features/sharing/assets/fonts/`) —
 * never a second download of the same coverage guarantee. Registration is
 * idempotent since Next's dev server can import this module more than once
 * per process.
 */
export function ensurePdfFontsRegistered(): void {
  if (registered) return;

  const fontsDir = path.join(process.cwd(), "src/features/memories/assets/fonts");
  Font.register({
    family: PDF_FONT_FAMILY,
    fonts: [
      { src: toFontDataUri(readFileSync(path.join(fontsDir, "NotoSans-Regular.woff"))), fontWeight: "normal" },
      { src: toFontDataUri(readFileSync(path.join(fontsDir, "NotoSans-Bold.woff"))), fontWeight: "bold" },
    ],
  });

  const brandDir = path.join(process.cwd(), "src/features/sharing/assets/fonts");
  Font.register({
    family: PDF_BRAND_FONT_FAMILY,
    fonts: [
      { src: toFontDataUri(readFileSync(path.join(brandDir, "Fraunces-Regular.woff"))), fontWeight: "normal" },
      { src: toFontDataUri(readFileSync(path.join(brandDir, "Fraunces-SemiBold.woff"))), fontWeight: 600 },
    ],
  });
  Font.register({
    family: PDF_HAND_FONT_FAMILY,
    fonts: [
      { src: toFontDataUri(readFileSync(path.join(brandDir, "Caveat-Regular.woff"))), fontWeight: "normal" },
      { src: toFontDataUri(readFileSync(path.join(brandDir, "Caveat-Bold.woff"))), fontWeight: "bold" },
    ],
  });

  // Disables react-pdf's default English hyphenation dictionary, which a
  // prior EPIC (see CLAUDE.md's "PDF generation architecture") confirmed
  // reproducibly corrupts rendered text — e.g. "Every" hyphenating as
  // "E-very" and losing its leading capital in the visual output, not just
  // the text layer. A print-quality Memory Print cannot ship with that
  // defect: identity-mapping every word to itself disables hyphenation
  // outright, which is correct here since these are short note/brand
  // strings, never long unbroken paragraphs that depend on hyphenation to
  // fit a column.
  Font.registerHyphenationCallback((word) => [word]);

  registered = true;
}

// A data: URI, not a raw Buffer: react-pdf's font loader treats `src` as a
// URL it fetches, and a data URI is the most portable way to hand it bytes
// we already have in memory without depending on filesystem path
// resolution surviving whatever bundling a deployment target does.
function toFontDataUri(buffer: Buffer): string {
  return `data:font/woff;base64,${buffer.toString("base64")}`;
}
