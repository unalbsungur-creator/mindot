import { readFileSync } from "node:fs";
import path from "node:path";
import { Font } from "@react-pdf/renderer";

export const PDF_FONT_FAMILY = "Noto Sans";

let registered = false;

/**
 * Noto Sans, latin-ext subset — covers Turkish (ğşıöüçĞŞİÖÜÇ), German
 * (äöüßÄÖÜ), French, and Spanish diacritics in a single file (verified
 * directly with fontkit before committing this approach; see the EPIC 006
 * report). Registration is idempotent since Next's dev server can import
 * this module more than once per process.
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

  registered = true;
}

// A data: URI, not a raw Buffer: react-pdf's font loader treats `src` as a
// URL it fetches, and a data URI is the most portable way to hand it bytes
// we already have in memory without depending on filesystem path
// resolution surviving whatever bundling a deployment target does.
function toFontDataUri(buffer: Buffer): string {
  return `data:font/woff;base64,${buffer.toString("base64")}`;
}
