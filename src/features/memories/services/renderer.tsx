import { Document, Image, Page } from "@react-pdf/renderer";

/**
 * The Memory Print PDF's real page size: 9.6in x 12in, a 4:5 portrait —
 * expressed in react-pdf's own unit (points, 1in = 72pt: 9.6*72=691.2,
 * 12*72=864). The same 4:5 shape as the Share "print" composition, so the
 * embedded image always fills the page exactly; its pixel density comes
 * from the raster size `pdf.tsx` renders at (1440x1800 → 150 DPI).
 */
const PAGE_WIDTH_PT = 691.2;
const PAGE_HEIGHT_PT = 864;

export interface MemoryPdfProps {
  /**
   * The exact PNG bytes `renderShareCard({ format: getShareFormat("print"), ... })`
   * produced for this same project — see `pdf.tsx`'s `generateMemoryPdf`.
   * This is the *only* input: the PDF has no composition logic of its own
   * to diverge from Share's.
   */
  imagePngBuffer: Buffer;
}

/**
 * The one PDF renderer for every Memory Print output (personal PDF,
 * digital frame, and — eventually — the physical print source file).
 *
 * SHARE IMAGE = PDF IMAGE: this page embeds the exact same PNG bytes the
 * Share "print" format (`/api/share/memory/[projectId]/print`) produces
 * for this project — real image-backed artwork, real emoji, the same
 * MINDOT branding/footer/date, the same frame — as a single full-bleed
 * `<Image>`, never a second, parallel composition drawn from
 * `noteTemplates`/`frameTemplates`/`brandMarkPdf.tsx` primitives. That
 * parallel vector-redraw approach (still in `noteCardPdf.tsx`/
 * `brandMarkPdf.tsx`, now unused by this file but deliberately left in
 * place — see CLAUDE.md) was the actual root cause of PDF diverging from
 * Share: it silently skipped the Sports/football two-tone artwork (EPIC
 * 039's own comment already admitted this — "deliberately doesn't
 * reproduce the two-tone ball"), and it hands emoji/pictograph characters
 * (e.g. "🏆") to react-pdf's Noto Sans text layer, which has no emoji glyph
 * coverage, corrupting them — a class of defect that embedding Satori's
 * already-correct raster output eliminates by construction, not by fixing
 * react-pdf's font/text pipeline.
 *
 * The page's own size is fixed (see `PAGE_WIDTH_PT`/`PAGE_HEIGHT_PT`
 * above) and matches the image's 4:5 aspect ratio, so the image fills it
 * edge to edge without distortion. The image is rendered at 1440x1800
 * (150 DPI on this page) rather than Share's 2880x3600 master — see
 * `pdf.tsx`'s PDF_RENDER_WIDTH for the Worker memory reason.
 */
export function MemoryPdfDocument({ imagePngBuffer }: MemoryPdfProps) {
  const imageSrc = `data:image/png;base64,${imagePngBuffer.toString("base64")}`;

  return (
    <Document title="MINDOT Memory Print" author="MINDOT">
      <Page size={{ width: PAGE_WIDTH_PT, height: PAGE_HEIGHT_PT }} style={{ padding: 0 }}>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf's Image has no alt prop; this is a PDF render target, not DOM */}
        <Image src={imageSrc} style={{ width: PAGE_WIDTH_PT, height: PAGE_HEIGHT_PT, objectFit: "contain" }} />
      </Page>
    </Document>
  );
}
