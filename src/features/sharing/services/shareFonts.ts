import { readFileSync } from "node:fs";
import path from "node:path";

export const SHARE_FONT_FAMILY = "Noto Sans";
/** The Memory Print's brand/heading font — matches the live site's `--font-display` (Fraunces), not a generic substitute. See noteCardSatori.tsx for why the note's own `font-hand`/`font-sans` choice is kept separate from this. */
export const BRAND_FONT_FAMILY = "Fraunces";
/** Note.tsx's `font-hand` (Tailwind `--font-hand` -> Google's Caveat, see globals.css) — used only for a note whose template has `font: "hand"`, exactly as Note.tsx renders it. */
export const HAND_FONT_FAMILY = "Caveat";

type LoadedFont = { name: string; data: ArrayBuffer; weight: 400 | 600 | 700; style: "normal" };

/**
 * Reuses the exact Noto Sans latin-ext files already downloaded and
 * glyph-verified for the PDF renderer (see features/memories/services/
 * fonts.ts) — never a second font asset for the same coverage guarantee
 * (Turkish/German/French/Spanish diacritics). `next/og`'s `ImageResponse`
 * takes font bytes directly (an ArrayBuffer), unlike react-pdf, so no data-
 * URI conversion is needed here.
 *
 * Fraunces (brand text) and Caveat (hand-styled note content) were added
 * for the Memory Print redesign — same verification discipline as the
 * original Noto Sans assets: downloaded as static (non-variable) WOFF
 * files — a plain variable-font TTF, tried first, fails to render at all
 * in this project's Satori build (throws on any weight/text) — and
 * confirmed via `fontkit` to have full glyph coverage for the same
 * Turkish/German/French/Spanish diacritics before being committed to
 * `assets/fonts/`.
 */
export function loadShareFonts(): LoadedFont[] {
  const fontsDir = path.join(process.cwd(), "src/features/memories/assets/fonts");
  const regular = readFileSync(path.join(fontsDir, "NotoSans-Regular.woff"));
  const bold = readFileSync(path.join(fontsDir, "NotoSans-Bold.woff"));

  const brandDir = path.join(process.cwd(), "src/features/sharing/assets/fonts");
  const frauncesRegular = readFileSync(path.join(brandDir, "Fraunces-Regular.woff"));
  const frauncesSemiBold = readFileSync(path.join(brandDir, "Fraunces-SemiBold.woff"));
  const caveatRegular = readFileSync(path.join(brandDir, "Caveat-Regular.woff"));
  const caveatBold = readFileSync(path.join(brandDir, "Caveat-Bold.woff"));

  return [
    { name: SHARE_FONT_FAMILY, data: toArrayBuffer(regular), weight: 400, style: "normal" },
    { name: SHARE_FONT_FAMILY, data: toArrayBuffer(bold), weight: 700, style: "normal" },
    { name: BRAND_FONT_FAMILY, data: toArrayBuffer(frauncesRegular), weight: 400, style: "normal" },
    { name: BRAND_FONT_FAMILY, data: toArrayBuffer(frauncesSemiBold), weight: 600, style: "normal" },
    { name: HAND_FONT_FAMILY, data: toArrayBuffer(caveatRegular), weight: 400, style: "normal" },
    { name: HAND_FONT_FAMILY, data: toArrayBuffer(caveatBold), weight: 700, style: "normal" },
  ];
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return Uint8Array.from(buffer).buffer;
}
