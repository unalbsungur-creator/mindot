import { Circle, Document, Page, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import { DOT_RADIUS, DOTS } from "@/components/brand/BrandMark";
import type { BoardTileMessage } from "@/features/board/types";
import { getNoteTemplate } from "@/features/notes/config/templates";
import { getFrameTemplate } from "../config/frameTemplates";
import type { CaptureRegion } from "../lib/captureRegion";
import { ensurePdfFontsRegistered } from "./fonts";
import { PDF_COLORS, PDF_PAPER_COLORS } from "./pdfPalette";

ensurePdfFontsRegistered();

const MAX_SURROUNDING_NOTES = 8;

function PdfBrandMark({ size, tone }: { size: number; tone: "brand" | "inverted" }) {
  const stemColor = PDF_COLORS.orange;
  const bowlColor = tone === "inverted" ? PDF_COLORS.surface : PDF_COLORS.navy;

  return (
    <Svg width={size} height={(size * 7.8) / 5.8} viewBox="-0.9 -0.9 5.8 7.8">
      {DOTS.map((dot) => (
        <Circle
          key={`${dot.x}-${dot.y}`}
          cx={dot.x}
          cy={dot.y}
          r={dot.variant === "landing" ? DOT_RADIUS * 1.35 : DOT_RADIUS}
          fill={dot.variant === "bowl" ? bowlColor : stemColor}
        />
      ))}
    </Svg>
  );
}

const styles = StyleSheet.create({
  page: {
    fontFamily: "Noto Sans",
    padding: 48,
    display: "flex",
    flexDirection: "column",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginBottom: 24,
  },
  wordmark: {
    fontSize: 12,
    fontWeight: "bold",
    marginLeft: 8,
  },
  primaryCard: {
    borderRadius: 6,
    padding: 28,
    marginBottom: 4,
  },
  primaryContent: {
    fontSize: 20,
    lineHeight: 1.5,
  },
  primaryAuthor: {
    fontSize: 11,
    marginTop: 16,
    opacity: 0.75,
  },
  surroundingHeading: {
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 32,
    marginBottom: 10,
    opacity: 0.6,
  },
  surroundingGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  surroundingCard: {
    width: "23%",
    borderRadius: 4,
    padding: 8,
  },
  surroundingText: {
    fontSize: 8,
    lineHeight: 1.3,
  },
  footer: {
    marginTop: "auto",
    paddingTop: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footerText: {
    fontSize: 8,
    opacity: 0.55,
  },
  footerBrandRow: {
    flexDirection: "row",
    alignItems: "center",
  },
});

export interface MemoryPdfProps {
  region: CaptureRegion;
  frameTemplateId: string;
  createdAt: Date;
}

/**
 * The one PDF renderer for every output type (personal PDF, digital
 * frame, and — eventually — the physical print source file). Reads note
 * appearance from the same `noteTemplates` registry the real `Note`
 * component uses, and the same brand dot data as `BrandMark` — a parallel
 * renderer only because PDF and DOM/CSS are fundamentally different
 * render targets, never a second source of truth for what a template or
 * the brand mark actually look like.
 */
export function MemoryPdfDocument({ region, frameTemplateId, createdAt }: MemoryPdfProps) {
  const frame = getFrameTemplate(frameTemplateId);
  const template = getNoteTemplate(region.primary.templateId);
  const paperColor = PDF_PAPER_COLORS[template.paper] ?? PDF_PAPER_COLORS.white;
  const isInverted = frame.background === PDF_COLORS.navy || frame.background === PDF_COLORS.orange;

  return (
    <Document>
      <Page size="A4" orientation={frame.orientation} style={[styles.page, { backgroundColor: frame.background }]}>
        {frame.logoPlacement === "corner" && (
          <View style={styles.header}>
            <PdfBrandMark size={16} tone={isInverted ? "inverted" : "brand"} />
          </View>
        )}

        <View style={[styles.primaryCard, { backgroundColor: paperColor }]}>
          <Text style={[styles.primaryContent, { color: PDF_COLORS.ink }]}>{region.primary.content}</Text>
          {region.primary.author && (
            <Text style={[styles.primaryAuthor, { color: PDF_COLORS.ink }]}>— {region.primary.author.displayName}</Text>
          )}
        </View>

        {region.surrounding.length > 0 && (
          <>
            <Text style={[styles.surroundingHeading, { color: frame.ink }]}>Around this thought</Text>
            <View style={styles.surroundingGrid}>
              {region.surrounding.slice(0, MAX_SURROUNDING_NOTES).map((note) => (
                <SurroundingNoteCard key={note.id} note={note} />
              ))}
            </View>
          </>
        )}

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: frame.ink }]}>
            {formatFooterDate(createdAt)} · Tile {region.tileX}, {region.tileY}
          </Text>
          {frame.logoPlacement === "footer" && (
            <View style={styles.footerBrandRow}>
              <PdfBrandMark size={12} tone={isInverted ? "inverted" : "brand"} />
              <Text style={[styles.wordmark, { color: frame.ink }]}>MINDOT</Text>
            </View>
          )}
        </View>
      </Page>
    </Document>
  );
}

function SurroundingNoteCard({ note }: { note: BoardTileMessage }) {
  const template = getNoteTemplate(note.templateId);
  const paperColor = PDF_PAPER_COLORS[template.paper] ?? PDF_PAPER_COLORS.white;
  const excerpt = note.content.length > 60 ? `${note.content.slice(0, 60)}…` : note.content;

  return (
    <View style={[styles.surroundingCard, { backgroundColor: paperColor }]}>
      <Text style={[styles.surroundingText, { color: PDF_COLORS.ink }]}>{excerpt}</Text>
    </View>
  );
}

function formatFooterDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
