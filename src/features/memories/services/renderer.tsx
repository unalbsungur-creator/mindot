import { Circle, Document, Image, Page, Rect, Svg, Text, View } from "@react-pdf/renderer";
import type { PdfBackground, PdfBackgroundPalette } from "../config/pdfBackgrounds";
import { layoutPdfDownload, V2_PAGE_HEIGHT_PT, V2_PAGE_WIDTH_PT } from "../lib/pdfDownloadLayout";
import { PDF_FONT_FAMILY } from "./fonts";

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

// ---------------------------------------------------------------------------
// PDF Download V2 — unframed projects only (see pdf.tsx). A framed project
// (digital frame) still gets MemoryPdfDocument above: its frame is a chosen,
// paid design and is never swapped for this one.
//
// Three layers, bottom to top, each absolutely placed inside the page:
//
// 1. The chosen design's background (config/pdfBackgrounds.ts, loaded by
//    pdfBackground.ts) — the D mark + MINDOT wordmark, the design's own
//    ornaments and its card frame. It is language-free and carries no
//    slogan, date or domain, so none of those can ever be stale or in the
//    wrong language. Nothing it contains is redrawn here.
// 2. The real card (`renderPdfCardImage`, pdfCardImage.tsx — the share
//    image's own `MemoryNoteCard`), centred inside the design's `cardWindow`.
//    All placement comes from `layoutPdfDownload` (lib/pdfDownloadLayout.ts).
// 3. Text the background deliberately leaves out: the fixed slogan
//    ("AKLINDA KALMASIN."), the generation date, and the canonical domain,
//    in the design's palette. The card's template name is never printed.
//
// Nothing here is shared with the share image.
// ---------------------------------------------------------------------------

export interface PdfDownloadDocumentProps {
  /** The chosen design — geometry and palette (config/pdfBackgrounds.ts). */
  design: PdfBackground;
  /** That design's background bytes (pdfBackground.ts) — embedded once, never re-encoded. */
  background: Buffer;
  /** The rendered card block (pdfCardImage.tsx). */
  card: { png: Buffer; width: number; height: number };
  /** The fixed brand slogan, already uppercased ("AKLINDA KALMASIN."). */
  slogan: string;
  /** The generation date, already formatted (lib/pdfDownloadDate.ts), e.g. "<D> EKİM <YYYY>" in Turkish. */
  date: string;
  /** The canonical domain as printed, e.g. "MIND-OT.COM". */
  domain: string;
}

/** Last word in orange, the rest in ink — the background design's two-tone slogan treatment, for any language. */
function splitSlogan(slogan: string): [string, string] {
  const index = slogan.lastIndexOf(" ");
  return index === -1 ? ["", slogan] : [slogan.slice(0, index + 1), slogan.slice(index + 1)];
}

export function PdfDownloadDocument({ design, background, card, slogan, date, domain }: PdfDownloadDocumentProps) {
  const { palette } = design;
  const layout = layoutPdfDownload(design, card);

  return (
    <Document title="MINDOT" author="MINDOT">
      {/* Every layer is absolutely placed inside the page bounds: a layer reaching past the edge makes
          react-pdf flow content onto extra pages, and wrap={false} renders blank. */}
      <Page size={{ width: V2_PAGE_WIDTH_PT, height: V2_PAGE_HEIGHT_PT }} style={{ padding: 0, backgroundColor: palette.page }}>
        {/* 1. Background — embedded from its raw bytes, so pdfkit stores the PNG's compressed data / the JPEG once. */}
        {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf's Image has no alt prop; this is a PDF render target, not DOM */}
        <Image
          src={{ data: background, format: design.assetFormat }}
          style={{ position: "absolute", left: 0, top: 0, width: V2_PAGE_WIDTH_PT, height: V2_PAGE_HEIGHT_PT }}
        />

        {/* 2. The real card — the page's hero, inside the background's frame. */}
        {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf's Image has no alt prop; this is a PDF render target, not DOM */}
        <Image src={{ data: card.png, format: "png" }} style={{ position: "absolute", ...layout.card }} />

        {/* 3. Text the background leaves out: rule, slogan, rule-dot-rule, date — and the domain. */}
        {layout.footer.placement === "inside" ? (
          <FooterText
            palette={palette}
            slogan={slogan}
            date={date}
            domain={domain}
            style={layout.footer.box}
          />
        ) : (
          <>
            <FooterText
              palette={palette}
              slogan={slogan}
              date={date}
              style={{ left: layout.footer.left, top: layout.footer.top, width: layout.footer.width }}
            />
            {/* The canonical domain, quietly at the foot of the page. */}
            <Text
              style={{
                position: "absolute",
                left: 0,
                top: layout.footer.domainTop,
                width: V2_PAGE_WIDTH_PT,
                textAlign: "center",
                fontFamily: PDF_FONT_FAMILY,
                fontSize: 6.5,
                letterSpacing: 2.6,
                color: palette.mist,
                opacity: 0.55,
              }}
            >
              {domain}
            </Text>
          </>
        )}
      </Page>
    </Document>
  );
}

/**
 * The slogan block; given `domain`, the domain closes it (the inside-the-frame
 * placement, whose box is `INSIDE_FOOTER_HEIGHT_PT` tall — keep this spacing
 * in step with lib/pdfDownloadLayout.ts).
 */
function FooterText({
  palette,
  slogan,
  date,
  domain,
  style,
}: {
  palette: PdfBackgroundPalette;
  slogan: string;
  date: string;
  domain?: string;
  style: { left: number; top: number; width: number; height?: number };
}) {
  const [sloganHead, sloganTail] = splitSlogan(slogan);
  return (
    <View style={{ position: "absolute", ...style, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <Svg width={34} height={2} viewBox="0 0 34 2">
        <Rect x={0} y={0} width={34} height={1.6} fill={palette.ornament} />
      </Svg>
      <Text style={{ marginTop: 16, fontFamily: PDF_FONT_FAMILY, fontWeight: "bold", fontSize: 17, letterSpacing: 4.2, color: palette.ink }}>
        {sloganHead}
        <Text style={{ color: palette.accent }}>{sloganTail}</Text>
      </Text>
      <Svg width={150} height={6} viewBox="0 0 150 6" style={{ marginTop: 16 }}>
        <Rect x={0} y={2.7} width={66} height={0.6} fill={palette.mist} fillOpacity={0.35} />
        <Circle cx={75} cy={3} r={3} fill={palette.ornament} />
        <Rect x={84} y={2.7} width={66} height={0.6} fill={palette.mist} fillOpacity={0.35} />
      </Svg>
      <Text style={{ marginTop: 14, fontFamily: PDF_FONT_FAMILY, fontSize: 7.5, letterSpacing: 2.2, color: palette.mist, opacity: 0.8 }}>{date}</Text>
      {domain && (
        <Text style={{ marginTop: 12, fontFamily: PDF_FONT_FAMILY, fontSize: 6.5, letterSpacing: 2.6, color: palette.mist, opacity: 0.7 }}>{domain}</Text>
      )}
    </View>
  );
}
