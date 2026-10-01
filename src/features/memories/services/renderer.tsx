import { Circle, Defs, Document, G, Image, Page, RadialGradient, Rect, Stop, Svg, Text, View } from "@react-pdf/renderer";
import { DOT_RADIUS, DOTS } from "@/components/brand/BrandMark";
import { PDF_BRAND_FONT_FAMILY, PDF_FONT_FAMILY } from "./fonts";
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
// Everything on this page except the card is vector: background, particles,
// the faint D, the logo and the metadata. The card is the one raster
// (`renderPdfCardImage`, pdfCardImage.tsx — the share image's own card
// renderer), so the page costs a single card-sized PNG instead of the old
// full-page 1440×1800 raster. Nothing here is shared with the share image.
// ---------------------------------------------------------------------------

const V2 = {
  background: "#0b1626",
  glow: "#1c324a",
  orange: PDF_COLORS.orange,
  /** The logo's own bowl blue (sampled from public/D Logo.png's blue dots). */
  logoBlue: "#4f7099",
  /** Soft mist blue (pdfPalette.ts's paper "blue"). */
  mist: "#cfe1e8",
  ink: "#f7f3ea",
};

/** Deterministic pseudo-random sequence (mulberry32) — every download of the same note is byte-stable. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Dot {
  cx: number;
  cy: number;
  r: number;
  fill: string;
  opacity: number;
}

/** Faint paper grain over the whole page, plus small brand particles drifting in from two corners — never behind the card. */
function backgroundDots(card: Box): Dot[] {
  const random = seededRandom(0x6d696e64); // "mind"
  const keepOut = { x: card.x - 18, y: card.y - 18, width: card.width + 36, height: card.height + 36 };
  const behindCard = (x: number, y: number) =>
    x > keepOut.x && x < keepOut.x + keepOut.width && y > keepOut.y && y < keepOut.y + keepOut.height;
  const dots: Dot[] = [];

  for (let i = 0; i < 260; i++) {
    dots.push({ cx: random() * PAGE_WIDTH_PT, cy: random() * PAGE_HEIGHT_PT, r: 0.35 + random() * 0.35, fill: V2.mist, opacity: 0.05 + random() * 0.05 });
  }
  for (let i = 0; i < 70; i++) {
    const topRight = i % 2 === 0;
    // Distance from the corner (denser near it) and an independent angle across the quarter-circle.
    const spread = Math.pow(random(), 1.4);
    const angle = random() * (Math.PI / 2);
    const distance = spread * PAGE_WIDTH_PT * 0.62;
    const x = topRight ? PAGE_WIDTH_PT - Math.cos(angle) * distance : Math.cos(angle) * distance;
    const y = topRight ? Math.sin(angle) * distance : PAGE_HEIGHT_PT - Math.sin(angle) * distance;
    const orange = random() < 0.45;
    const r = 0.9 + random() * 1.8;
    if (behindCard(x, y)) continue;
    dots.push({ cx: x, cy: y, r, fill: orange ? V2.orange : V2.logoBlue, opacity: (orange ? 0.35 : 0.45) * (1 - spread * 0.6) });
  }
  return dots;
}

/** The BrandMark dot grid (same DOTS/DOT_RADIUS as the site logo) — orange stem, logo-blue bowl. */
function BrandDots({ size }: { size: number }) {
  return (
    <Svg width={size} height={(size * 7.8) / 5.8} viewBox="-0.9 -0.9 5.8 7.8">
      {DOTS.map((dot) => (
        <Circle
          key={`${dot.x}-${dot.y}`}
          cx={dot.x}
          cy={dot.y}
          r={dot.variant === "landing" ? DOT_RADIUS * 1.35 : DOT_RADIUS}
          fill={dot.variant === "bowl" ? V2.logoBlue : V2.orange}
        />
      ))}
    </Svg>
  );
}

export interface PdfDownloadDocumentProps {
  /** The rendered card block (pdfCardImage.tsx). */
  card: { png: Buffer; width: number; height: number };
  /** `boardPage.slogan` in the note's own language. */
  slogan: string;
  /** Localized, uppercased template name, e.g. "KLASİK MINDOT". */
  templateLabel: string;
  /** DD.MM.YYYY — the same date the share image prints. */
  date: string | null;
}

export function PdfDownloadDocument({ card, slogan, templateLabel, date }: PdfDownloadDocumentProps) {
  // Card block: as large as fits between the logo band and the metadata band,
  // never more than 0.5pt per px (≈144 DPI) — always exactly one page.
  const top = 104;
  const bottom = PAGE_HEIGHT_PT - 168;
  const scale = Math.min(0.5, 470 / card.width, (bottom - top) / card.height);
  const width = card.width * scale;
  const height = card.height * scale;
  const cardBox: Box = { x: (PAGE_WIDTH_PT - width) / 2, y: top + (bottom - top - height) / 2, width, height };
  const centerX = PAGE_WIDTH_PT / 2;
  const centerY = cardBox.y + cardBox.height / 2;
  const motifSize = 170;

  return (
    <Document title="MINDOT" author="MINDOT">
      {/* Every layer is absolutely placed inside the page bounds: a layer reaching past the edge makes
          react-pdf flow content onto extra pages (measured: 3 pages), and wrap={false} renders blank. */}
      <Page size={{ width: PAGE_WIDTH_PT, height: PAGE_HEIGHT_PT }} style={{ padding: 0, backgroundColor: V2.background }}>
        {/* 1–2. Night-navy field, a soft glow behind the card, two hairline rings, particles and grain. */}
        <Svg
          style={{ position: "absolute", top: 0, left: 0 }}
          width={PAGE_WIDTH_PT}
          height={PAGE_HEIGHT_PT}
          viewBox={`0 0 ${PAGE_WIDTH_PT} ${PAGE_HEIGHT_PT}`}
        >
          <Defs>
            <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={V2.glow} stopOpacity={0.95} />
              <Stop offset="100%" stopColor={V2.background} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width={PAGE_WIDTH_PT} height={PAGE_HEIGHT_PT} fill={V2.background} />
          <Circle cx={centerX} cy={centerY} r={360} fill="url(#glow)" />
          <Circle cx={centerX} cy={centerY} r={318} fill="none" stroke={V2.mist} strokeWidth={0.5} strokeOpacity={0.07} />
          <Circle cx={centerX} cy={centerY} r={372} fill="none" stroke={V2.mist} strokeWidth={0.5} strokeOpacity={0.045} />
          {backgroundDots(cardBox).map((dot, index) => (
            <Circle key={index} cx={dot.cx} cy={dot.cy} r={dot.r} fill={dot.fill} fillOpacity={dot.opacity} />
          ))}
          {/* A very faint, large D in the bottom-right corner — the only oversized brand form, clear of
              the card and the metadata. Drawn inside this page-sized SVG: a separate layer reaching past
              the page edge makes react-pdf push content onto further pages. */}
          <G transform={`translate(${PAGE_WIDTH_PT - motifSize - 16} ${PAGE_HEIGHT_PT - (motifSize * 7.8) / 5.8 - 14}) scale(${motifSize / 5.8})`}>
            {DOTS.map((dot) => (
              <Circle
                key={`${dot.x}-${dot.y}`}
                cx={dot.x + 0.9}
                cy={dot.y + 0.9}
                r={dot.variant === "landing" ? DOT_RADIUS * 1.35 : DOT_RADIUS}
                fill={dot.variant === "bowl" ? V2.logoBlue : V2.orange}
                fillOpacity={0.05}
              />
            ))}
          </G>
        </Svg>


        {/* 3. Small logo: dot mark + MIN·D·OT wordmark (MindotLogo.tsx's horizontal lockup). */}
        <View
          style={{ position: "absolute", top: 46, left: 0, width: PAGE_WIDTH_PT, display: "flex", flexDirection: "row", justifyContent: "center", alignItems: "center" }}
        >
          <BrandDots size={13} />
          <Text style={{ marginLeft: 9, fontFamily: PDF_FONT_FAMILY, fontWeight: "bold", fontSize: 11, letterSpacing: 4.5, color: V2.ink }}>
            MIN<Text style={{ color: V2.orange }}>D</Text>OT
          </Text>
        </View>

        {/* 4. The real card — the page's hero. */}
        {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf's Image has no alt prop; this is a PDF render target, not DOM */}
        <Image
          src={`data:image/png;base64,${card.png.toString("base64")}`}
          style={{ position: "absolute", left: cardBox.x, top: cardBox.y, width: cardBox.width, height: cardBox.height }}
        />

        {/* 5. Editorial metadata: the brand dot, the slogan, a hairline, template · date. */}
        <View
          style={{ position: "absolute", left: 0, top: PAGE_HEIGHT_PT - 124, width: PAGE_WIDTH_PT, display: "flex", flexDirection: "column", alignItems: "center" }}
        >
          <Svg width={6} height={6} viewBox="0 0 6 6">
            <Circle cx={3} cy={3} r={3} fill={V2.orange} />
          </Svg>
          <Text style={{ marginTop: 14, fontFamily: PDF_BRAND_FONT_FAMILY, fontSize: 17, color: V2.ink }}>{slogan}</Text>
          <Svg width={44} height={1} viewBox="0 0 44 1" style={{ marginTop: 14 }}>
            <Rect x={0} y={0} width={44} height={0.6} fill={V2.mist} fillOpacity={0.35} />
          </Svg>
          <Text style={{ marginTop: 12, fontFamily: PDF_FONT_FAMILY, fontSize: 7.5, letterSpacing: 2.2, color: V2.mist, opacity: 0.75 }}>
            {date ? `${templateLabel}  ·  ${date}` : templateLabel}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
