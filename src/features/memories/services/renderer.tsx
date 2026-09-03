import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { BoardTileMessage } from "@/features/board/types";
import { getNoteTemplate } from "@/features/notes/config/templates";
import { matchBrowserLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/translations";
import { getFrameTemplate } from "../config/frameTemplates";
import type { CaptureRegion } from "../lib/captureRegion";
import { PdfBrandLockup, PdfSeal, PdfSloganText, PdfWatermark, pdfLogoToneFor } from "./brandMarkPdf";
import { ensurePdfFontsRegistered, PDF_FONT_FAMILY } from "./fonts";
import { estimateMemoryCardSize, MemoryNoteCardPdf, pdfSafeText } from "./noteCardPdf";
import { PDF_COLORS, PDF_PAPER_COLORS } from "./pdfPalette";
import { safeTextScale, wrapTextToLines } from "./pdfTextMeasure";

ensurePdfFontsRegistered();

const MAX_SURROUNDING_NOTES = 6;
const SURROUNDING_PER_ROW = 3;
const SURROUNDING_EXCERPT_CHARS = 70;

/**
 * The Memory Print PDF's real page size: 2880x3600px at 300 DPI — 9.6in x
 * 12in, a 4:5 portrait — expressed in react-pdf's own unit (points, 1in =
 * 72pt: 9.6*72=691.2, 12*72=864). This is a physical/print target, not a
 * screen size, and it is fixed regardless of which `FrameTemplate` is
 * selected — a `frame.orientation` no longer flips the page to landscape;
 * every Memory Print keeps this exact ratio, matching the Print share
 * format's own 2880x3600 and this EPIC's explicit requirement to preserve
 * it.
 */
const PAGE_WIDTH_PT = 691.2;
const PAGE_HEIGHT_PT = 864;
const OUTER_PADDING = 48;
const HEADER_HEIGHT = 56;
const FOOTER_HEIGHT = 118;
const SECTION_GAP = 22;

export interface MemoryPdfProps {
  region: CaptureRegion;
  frameTemplateId: string;
}

/**
 * The one PDF renderer for every Memory Print output (personal PDF,
 * digital frame, and — eventually — the physical print source file).
 *
 * Composition is a vector translation of Share's own gallery-print design
 * (`renderFullyDrawnShareCard` in `features/sharing/services/
 * shareCardRenderer.tsx`, the same layout already used for the Print/OG
 * Satori formats) — a faint centered watermark, a header brand lockup, the
 * real note card as the hero, an optional receded surrounding-notes grid,
 * and a footer of brand slogan + dot + date + (per-frame) a second lockup
 * — never the old, unrelated navy "AROUND THIS THOUGHT" / "Tile X,Y"
 * layout this replaced. It is a *parallel* implementation of that Satori
 * design, not a second source of truth for it: note appearance still
 * comes from the same `noteTemplates` registry via `MemoryNoteCardPdf`,
 * the same brand-mark dot data via `brandMarkPdf.tsx`, and the same
 * `pdfPalette.ts` colors — translated to react-pdf's vector primitives
 * because a PDF and a raster/DOM render target fundamentally can't share
 * component code (see noteCardPdf.tsx's doc comment for exactly where
 * that translation diverges, and why).
 *
 * The footer's date comes from the message's own `createdAt` (via
 * `region.primary`), not the Memory Project's own creation timestamp —
 * matching Share's `toShareCardNote`/`formatMemoryDate`, so the same
 * message always shows the same date on every MINDOT output.
 */
export function MemoryPdfDocument({ region, frameTemplateId }: MemoryPdfProps) {
  const frame = getFrameTemplate(frameTemplateId);
  const logoTone = pdfLogoToneFor(frame.background);
  const showFooterLogo = frame.logoPlacement === "footer";
  const showHeaderLogo = !showFooterLogo;
  const slogan = getDictionary(matchBrowserLocale(region.primary.language)).boardPage.slogan;
  const date = formatMemoryDate(region.primary.createdAt);

  const contentWidth = PAGE_WIDTH_PT - OUTER_PADDING * 2;
  const contentHeight = PAGE_HEIGHT_PT - OUTER_PADDING * 2;
  const rows = chunk(region.surrounding.slice(0, MAX_SURROUNDING_NOTES), SURROUNDING_PER_ROW);
  const rowWidth = contentWidth;
  const surroundingCardWidth = (rowWidth - (SURROUNDING_PER_ROW - 1) * 10) / SURROUNDING_PER_ROW;
  const surroundingReserve = rows.length > 0 ? rows.length * 58 + SECTION_GAP : 0;

  // Same "shrink to guarantee containment" technique as Share's own
  // renderer: the card's natural height at a generous target width, then
  // proportionally shrunk (once, not iteratively — estimateMemoryCardSize
  // is linear in width) if it would exceed the room actually available,
  // with a 0.92 safety factor so it never touches the header/footer bands
  // it needs real whitespace from — a print-safe margin is exactly this
  // EPIC's own explicit requirement ("güvenli baskı marjı").
  const availableCardHeight = Math.max(contentHeight * 0.2, contentHeight - HEADER_HEIGHT - FOOTER_HEIGHT - SECTION_GAP * 2 - surroundingReserve) * 0.92;
  let cardWidth = contentWidth * 0.64;
  let cardSize = estimateMemoryCardSize(region.primary.templateId, region.primary.content, cardWidth);
  if (cardSize.height > availableCardHeight) {
    cardWidth *= availableCardHeight / cardSize.height;
    cardSize = estimateMemoryCardSize(region.primary.templateId, region.primary.content, cardWidth);
  }

  return (
    <Document>
      <Page
        size={{ width: PAGE_WIDTH_PT, height: PAGE_HEIGHT_PT }}
        style={{ fontFamily: PDF_FONT_FAMILY, padding: OUTER_PADDING, display: "flex", flexDirection: "column", backgroundColor: frame.background }}
      >
        <PdfWatermark pageWidth={PAGE_WIDTH_PT} tone={logoTone} />

        <View style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", height: HEADER_HEIGHT }}>
          {showHeaderLogo && <PdfBrandLockup size={20} tone={logoTone} inkColor={frame.ink} />}
        </View>

        <View style={{ position: "relative", display: "flex", flex: 1, flexDirection: "column", alignItems: "center", justifyContent: "center", gap: SECTION_GAP }}>
          <MemoryNoteCardPdf
            content={region.primary.content}
            authorName={region.primary.author?.displayName ?? null}
            templateId={region.primary.templateId}
            rotation={0}
            width={cardWidth}
          />

          {rows.length > 0 && (
            <View style={{ display: "flex", flexDirection: "column", gap: 10, width: rowWidth, opacity: 0.82 }}>
              {rows.map((row, rowIndex) => (
                <View key={rowIndex} style={{ display: "flex", flexDirection: "row", gap: 10, justifyContent: "center" }}>
                  {row.map((note) => (
                    <SurroundingNoteCard key={note.id} note={note} width={surroundingCardWidth} />
                  ))}
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, height: FOOTER_HEIGHT, justifyContent: "flex-end" }}>
          <PdfSloganText fontSize={19} color={frame.ink}>
            {pdfSafeText(slogan)}
          </PdfSloganText>
          <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: PDF_COLORS.orange }} />
          <Text style={{ fontSize: 10, color: frame.ink, opacity: 0.6, letterSpacing: 1 }}>{date}</Text>
          {showFooterLogo && <PdfBrandLockup size={14} tone={logoTone} inkColor={frame.ink} />}
        </View>

        <View style={{ position: "absolute", right: OUTER_PADDING * 0.5, bottom: OUTER_PADDING * 0.5 }}>
          <PdfSeal size={32} tone={logoTone} ringColor={PDF_COLORS.border} backgroundColor={PDF_COLORS.surface} />
        </View>
      </Page>
    </Document>
  );
}

const SURROUNDING_FONT_SIZE = 8.5;
const SURROUNDING_PADDING = 10;

function SurroundingNoteCard({ note, width }: { note: BoardTileMessage; width: number }) {
  const template = getNoteTemplate(note.templateId);
  const paperColor = PDF_PAPER_COLORS[template.paper] ?? PDF_PAPER_COLORS.white;
  const excerpt = note.content.length > SURROUNDING_EXCERPT_CHARS ? `${note.content.slice(0, SURROUNDING_EXCERPT_CHARS).trimEnd()}…` : note.content;
  // Same guaranteed-fit protection as the hero card (see noteCardPdf.tsx /
  // pdfTextMeasure.ts) — this box is narrower still, so both of that file's
  // two confirmed react-pdf line-breaking defects are even more likely here.
  const innerWidth = width - SURROUNDING_PADDING * 2;
  const fontSize = SURROUNDING_FONT_SIZE * safeTextScale(excerpt, "sans", SURROUNDING_FONT_SIZE, 1, innerWidth);
  const wrappedExcerpt = wrapTextToLines(excerpt, "sans", fontSize, innerWidth).join("\n");

  return (
    <View style={{ display: "flex", width, borderRadius: 8, padding: SURROUNDING_PADDING, backgroundColor: paperColor }}>
      <Text style={{ fontSize, lineHeight: 1.35, color: PDF_COLORS.ink }}>{pdfSafeText(wrappedExcerpt)}</Text>
    </View>
  );
}

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

/** `DD.MM.YYYY` from the message's own real `createdAt` — same convention as `features/sharing/lib/shareCardData.ts`'s `formatMemoryDate` (deliberately not re-imported across the sharing/memories boundary for one 3-line pure-string function; kept in sync by convention, both driven by the same fixed print-date format this EPIC specifies). */
function formatMemoryDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-");
  return `${day}.${month}.${year}`;
}
