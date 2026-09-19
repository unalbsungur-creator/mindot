import { Document, Image, Page } from "@react-pdf/renderer";

/**
 * The Memory Print PDF's real page size: 2880x3600px at 300 DPI — 9.6in x
 * 12in, a 4:5 portrait — expressed in react-pdf's own unit (points, 1in =
 * 72pt: 9.6*72=691.2, 12*72=864). Deliberately identical, pixel-for-pixel
 * at this exact DPI, to the Share "print" format's own output canvas
 * (`shareFormats.ts`'s `{ id: "print", width: 2880, height: 3600 }`) — see
 * this file's own doc comment below for why that's the point.
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
 * The page's own size is fixed at exactly the Share "print" format's pixel
 * dimensions and DPI (see `PAGE_WIDTH_PT`/`PAGE_HEIGHT_PT` above) — a 1:1
 * embed, never upscaled or downscaled, so the print artwork stays as sharp
 * as Share's own 2880x3600 master.
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
