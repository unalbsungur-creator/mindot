import { readFileSync } from "node:fs";
import path from "node:path";

export const SHARE_FONT_FAMILY = "Noto Sans";

/**
 * Reuses the exact Noto Sans latin-ext files already downloaded and
 * glyph-verified for the PDF renderer (see features/memories/services/
 * fonts.ts) — never a second font asset for the same coverage guarantee
 * (Turkish/German/French/Spanish diacritics). `next/og`'s `ImageResponse`
 * takes font bytes directly (an ArrayBuffer), unlike react-pdf, so no data-
 * URI conversion is needed here.
 */
export function loadShareFonts(): { name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" }[] {
  const fontsDir = path.join(process.cwd(), "src/features/memories/assets/fonts");
  const regular = readFileSync(path.join(fontsDir, "NotoSans-Regular.woff"));
  const bold = readFileSync(path.join(fontsDir, "NotoSans-Bold.woff"));

  return [
    { name: SHARE_FONT_FAMILY, data: toArrayBuffer(regular), weight: 400, style: "normal" },
    { name: SHARE_FONT_FAMILY, data: toArrayBuffer(bold), weight: 700, style: "normal" },
  ];
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return Uint8Array.from(buffer).buffer;
}
