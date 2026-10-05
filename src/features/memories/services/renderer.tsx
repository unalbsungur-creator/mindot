import { Circle, Document, Image, Page, Rect, Svg, Text, View } from "@react-pdf/renderer";
import { PDF_FONT_FAMILY } from "./fonts";
import { PDF_COLORS } from "./pdfPalette";

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
// 1. The designer's background, `public/images/pdf/mindot-pdf-background-v2-clean.png`
//    (pdfBackground.ts) — night-navy field, the D mark + MINDOT wordmark,
//    the orange/blue particle arcs, the hairline rings, and the glowing
//    orange card frame with its dashed inner border. It is language-free
//    and carries no slogan, date or domain, so none of those can ever be
//    stale or in the wrong language. Nothing it contains is redrawn here.
// 2. The real card (`renderPdfCardImage`, pdfCardImage.tsx — the share
//    image's own `MemoryNoteCard`), centred inside the frame's dashed border.
// 3. Text the background deliberately leaves out: the fixed slogan
//    ("AKLINDA KALMASIN."), the generation date, and the canonical domain.
//    The card's template name is never printed.
//
// Nothing here is shared with the share image.
// ---------------------------------------------------------------------------

/**
 * The background's pixel geometry, measured on the asset itself (1024×1536,
 * opaque RGB): the orange frame's outer edge runs x 204–820, y 402–1062,
 * and its dashed inner border x 218–805, y 416–1048. `CARD_WINDOW` is the
 * area just inside that dashed border. Re-measure these if the asset changes.
 */
export const PDF_BACKGROUND_SIZE = { width: 1024, height: 1536 };
const CARD_WINDOW = { x: 219, y: 417, width: 586, height: 631 };
/** Breathing room between the card and the dashed border, in background pixels. */
const CARD_WINDOW_PADDING = 26;

/**
 * 8 × 12 in (576 × 864 pt) — the background's own 2:3 shape, so it fills the
 * page edge to edge with no crop or letterbox. Derived from the asset's size
 * rather than written down twice.
 */
const V2_PAGE_WIDTH_PT = 576;
const V2_PAGE_HEIGHT_PT = (V2_PAGE_WIDTH_PT * PDF_BACKGROUND_SIZE.height) / PDF_BACKGROUND_SIZE.width;
/** Points per background pixel. */
const V2_SCALE = V2_PAGE_WIDTH_PT / PDF_BACKGROUND_SIZE.width;

const V2 = {
  orange: PDF_COLORS.orange,
  ink: "#f7f3ea",
  mist: "#cfe1e8",
};

export interface PdfDownloadDocumentProps {
  /** The background PNG's bytes (pdfBackground.ts) — embedded once, never re-encoded. */
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

export function PdfDownloadDocument({ background, card, slogan, date, domain }: PdfDownloadDocumentProps) {
  // Fit the card block inside the frame's dashed border (never past it, never
  // upscaled beyond 0.5pt per px ≈ 144 DPI), centred on the window.
  const windowX = (CARD_WINDOW.x + CARD_WINDOW_PADDING) * V2_SCALE;
  const windowY = (CARD_WINDOW.y + CARD_WINDOW_PADDING) * V2_SCALE;
  const windowWidth = (CARD_WINDOW.width - CARD_WINDOW_PADDING * 2) * V2_SCALE;
  const windowHeight = (CARD_WINDOW.height - CARD_WINDOW_PADDING * 2) * V2_SCALE;
  const scale = Math.min(0.5, windowWidth / card.width, windowHeight / card.height);
  const cardWidth = card.width * scale;
  const cardHeight = card.height * scale;
  const cardX = windowX + (windowWidth - cardWidth) / 2;
  const cardY = windowY + (windowHeight - cardHeight) / 2;
  const [sloganHead, sloganTail] = splitSlogan(slogan);
  const frameBottom = 1062 * V2_SCALE;

  return (
    <Document title="MINDOT" author="MINDOT">
      {/* Every layer is absolutely placed inside the page bounds: a layer reaching past the edge makes
          react-pdf flow content onto extra pages, and wrap={false} renders blank. */}
      <Page size={{ width: V2_PAGE_WIDTH_PT, height: V2_PAGE_HEIGHT_PT }} style={{ padding: 0, backgroundColor: "#001e3c" }}>
        {/* 1. Background — embedded from its raw bytes, so pdfkit stores the PNG's own compressed data once. */}
        {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf's Image has no alt prop; this is a PDF render target, not DOM */}
        <Image
          src={{ data: background, format: "png" }}
          style={{ position: "absolute", left: 0, top: 0, width: V2_PAGE_WIDTH_PT, height: V2_PAGE_HEIGHT_PT }}
        />

        {/* 2. The real card — the page's hero, inside the background's frame. */}
        {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf's Image has no alt prop; this is a PDF render target, not DOM */}
        <Image src={{ data: card.png, format: "png" }} style={{ position: "absolute", left: cardX, top: cardY, width: cardWidth, height: cardHeight }} />

        {/* 3. Text the background leaves out: orange rule, slogan, rule-dot-rule, date. */}
        <View
          style={{ position: "absolute", left: 0, top: frameBottom + 30, width: V2_PAGE_WIDTH_PT, display: "flex", flexDirection: "column", alignItems: "center" }}
        >
          <Svg width={34} height={2} viewBox="0 0 34 2">
            <Rect x={0} y={0} width={34} height={1.6} fill={V2.orange} />
          </Svg>
          <Text style={{ marginTop: 16, fontFamily: PDF_FONT_FAMILY, fontWeight: "bold", fontSize: 17, letterSpacing: 4.2, color: V2.ink }}>
            {sloganHead}
            <Text style={{ color: V2.orange }}>{sloganTail}</Text>
          </Text>
          <Svg width={150} height={6} viewBox="0 0 150 6" style={{ marginTop: 16 }}>
            <Rect x={0} y={2.7} width={66} height={0.6} fill={V2.mist} fillOpacity={0.35} />
            <Circle cx={75} cy={3} r={3} fill={V2.orange} />
            <Rect x={84} y={2.7} width={66} height={0.6} fill={V2.mist} fillOpacity={0.35} />
          </Svg>
          <Text style={{ marginTop: 14, fontFamily: PDF_FONT_FAMILY, fontSize: 7.5, letterSpacing: 2.2, color: V2.mist, opacity: 0.8 }}>
            {date}
          </Text>
        </View>

        {/* The canonical domain, quietly at the foot of the page. */}
        <Text
          style={{
            position: "absolute",
            left: 0,
            top: V2_PAGE_HEIGHT_PT - 46,
            width: V2_PAGE_WIDTH_PT,
            textAlign: "center",
            fontFamily: PDF_FONT_FAMILY,
            fontSize: 6.5,
            letterSpacing: 2.6,
            color: V2.mist,
            opacity: 0.55,
          }}
        >
          {domain}
        </Text>
      </Page>
    </Document>
  );
}
