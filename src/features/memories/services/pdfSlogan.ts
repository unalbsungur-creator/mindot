import { layoutSlogan, type SloganLayout } from "@/features/sharing/lib/sloganLayout";
import type { PdfBackground } from "../config/pdfBackgrounds";
import { pdfSloganMaxWidth, PDF_SLOGAN_FONT_SIZE_PT, PDF_SLOGAN_LETTER_SPACING_EM } from "../lib/pdfDownloadLayout";
import { sloganMeasure } from "./pdfTextMeasure";

/** Kept a hair inside the measured limit, so react-pdf's own layout never wraps a line `layoutSlogan` said fits. */
const SLOGAN_WIDTH_SAFETY = 0.97;

/**
 * The PDF slogan's size and line breaks on `design` (sharing/lib/sloganLayout.ts):
 * one centred line, shrunk by at most 20% if needed, otherwise two balanced
 * lines. Measured with the Noto Sans Bold renderer.tsx draws it in. Needs the
 * measure fonts loaded (`generateMemoryPdf` does that first).
 */
export function layoutPdfSlogan(design: PdfBackground, slogan: string): SloganLayout {
  return layoutSlogan(slogan, {
    fontSize: PDF_SLOGAN_FONT_SIZE_PT,
    maxWidth: pdfSloganMaxWidth(design) * SLOGAN_WIDTH_SAFETY,
    measure: sloganMeasure("bold", PDF_SLOGAN_LETTER_SPACING_EM),
  });
}
