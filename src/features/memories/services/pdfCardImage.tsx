import type { CSSProperties } from "react";
import { ImageResponse } from "next/og";
import { getNoteTemplate } from "@/features/notes/config/templates";
import type { NoteTemplate } from "@/features/notes/types";
import { readPublicAsset } from "@/features/sharing/services/publicAsset";
import { decodePng, type DecodedPng } from "@/lib/assets/png";
import type { ShareCardNote } from "@/features/sharing/services/shareCardRenderer";
import { estimateMemoryCardSize, isImageBacked, loadTemplateArtwork, MemoryNoteCard } from "@/features/sharing/services/noteCardSatori";
import { loadShareFonts, SHARE_FONT_FAMILY } from "@/features/sharing/services/shareFonts";
import { PDF_COLORS, PDF_PAPER_COLORS } from "./pdfPalette";

/**
 * PDF Download V2 — the one raster on the page: the note card itself, plus
 * (for a `note_with_surrounding` capture) a row of its tile neighbours'
 * excerpts, on a transparent background. Everything around it — background,
 * logo, metadata — is drawn as vectors by `renderer.tsx`.
 *
 * The card is `MemoryNoteCard`, the exact Satori component the share image
 * uses (imported, not modified), so the PDF card is the same card as the
 * share image's: image-backed artwork, the two-tone sports ball, emoji. That
 * is why the card is still rasterized rather than redrawn with react-pdf
 * primitives (see renderer.tsx's note on `noteCardPdf.tsx`).
 *
 * Kept small on purpose: the card is rendered at 720px wide (≈144 DPI at
 * its printed size) on a canvas only as large as the card block, instead
 * of the old full 1440×1800 page raster.
 */
export const PDF_CARD_RENDER_WIDTH = 720;

const SURROUNDING_PER_ROW = 3;
const MAX_SURROUNDING = 6;
const SURROUNDING_EXCERPT_CHARS = 64;
const SURROUNDING_GAP = 18;
const SURROUNDING_CHIP_HEIGHT = 128;
const BLOCK_GAP = 44;
/** How far a `contentArea`-sized backing reaches past it, as a fraction of the card's size. */
const CONTENT_BACKING_BLEED = 0.04;
/** Where a frame's edges are sampled (and how far a card-sized backing stays inside them), as a fraction of the card. */
const EDGE_INSET = 0.015;
/** At or below this alpha a pixel counts as see-through. */
const TRANSPARENT_ALPHA = 32;

export interface PdfCardImage {
  png: Buffer;
  width: number;
  height: number;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

/**
 * A few image-backed cards (celebration-spark, congratulations-note) are
 * decorative frames with a genuinely transparent centre, designed to be read
 * over the board's light canvas. On this navy page their dark text would sit
 * on navy, so such a card gets the board's canvas tone drawn *under* it —
 * the card itself is untouched, and its opaque frame still covers the
 * backing at the edges, exactly as it covers the board.
 *
 * Measured on the artwork's own alpha (once per template per isolate), not
 * listed by id: the centre of `contentArea` must be transparent. A frame
 * whose edges are opaque gets a backing the size of the whole card; anything
 * else only behind its `contentArea`, so the backing can never show around a
 * card's own outline. Every other card — opaque paper — gets none.
 */
type Backing = "card" | "content" | null;
const backingCache = new Map<string, Promise<Backing>>();

function alphaAt(png: DecodedPng, fx: number, fy: number): number {
  const x = Math.min(png.header.width - 1, Math.max(0, Math.round(fx * png.header.width)));
  const y = Math.min(png.header.height - 1, Math.max(0, Math.round(fy * png.header.height)));
  return png.rgba[(y * png.header.width + x) * 4 + 3];
}

function backingFor(template: NoteTemplate): Promise<Backing> {
  if (!isImageBacked(template)) return Promise.resolve(null);
  let cached = backingCache.get(template.id);
  if (!cached) {
    cached = readPublicAsset(template.image!).then((bytes) => {
      const png = decodePng(Buffer.from(bytes));
      const area = template.contentArea!;
      const centreX = (parseFloat(area.left) + parseFloat(area.width) / 2) / 100;
      const centreY = (parseFloat(area.top) + parseFloat(area.height) / 2) / 100;
      if (alphaAt(png, centreX, centreY) > TRANSPARENT_ALPHA) return null;
      const edges: [number, number][] = [[0.5, EDGE_INSET], [0.5, 1 - EDGE_INSET], [EDGE_INSET, 0.5], [1 - EDGE_INSET, 0.5]];
      return edges.every(([x, y]) => alphaAt(png, x, y) === 255) ? "card" : "content";
    });
    cached.catch(() => backingCache.delete(template.id));
    backingCache.set(template.id, cached);
  }
  return cached;
}

function backingStyle(backing: Exclude<Backing, null>, template: NoteTemplate, width: number, height: number): CSSProperties {
  if (backing === "card") {
    const inset = width * EDGE_INSET;
    return { position: "absolute", left: inset, top: inset, width: width - inset * 2, height: height - inset * 2, background: PDF_COLORS.canvas };
  }
  const area = template.contentArea!;
  return {
    position: "absolute",
    left: (parseFloat(area.left) / 100 - CONTENT_BACKING_BLEED) * width,
    top: (parseFloat(area.top) / 100 - CONTENT_BACKING_BLEED) * height,
    width: (parseFloat(area.width) / 100 + CONTENT_BACKING_BLEED * 2) * width,
    height: (parseFloat(area.height) / 100 + CONTENT_BACKING_BLEED * 2) * height,
    background: PDF_COLORS.canvas,
    borderRadius: width * 0.03,
  };
}

/** Same mapping the share image uses for neighbour excerpts: the template's paper tone. */
function paperColorFor(templateId: string): string {
  return PDF_PAPER_COLORS[getNoteTemplate(templateId).paper] ?? PDF_PAPER_COLORS.white;
}

export async function renderPdfCardImage(primary: ShareCardNote, surrounding: ShareCardNote[]): Promise<PdfCardImage> {
  const cardWidth = PDF_CARD_RENDER_WIDTH;
  const { height: cardHeight } = estimateMemoryCardSize(primary.templateId, primary.content, cardWidth, primary.fontFamily);
  const neighbours = surrounding.slice(0, MAX_SURROUNDING);
  const rows: ShareCardNote[][] = [];
  for (let i = 0; i < neighbours.length; i += SURROUNDING_PER_ROW) rows.push(neighbours.slice(i, i + SURROUNDING_PER_ROW));

  // Wider than the card only when there is a neighbour row to lay out — a lone
  // card gets a canvas exactly its own width, so it can fill the page's frame.
  const width = rows.length > 0 ? Math.round(cardWidth * 1.3) : cardWidth;
  const chipWidth = (width - (SURROUNDING_PER_ROW - 1) * SURROUNDING_GAP) / SURROUNDING_PER_ROW;
  const rowsHeight = rows.length > 0 ? BLOCK_GAP + rows.length * SURROUNDING_CHIP_HEIGHT + (rows.length - 1) * SURROUNDING_GAP : 0;
  const height = cardHeight + rowsHeight;

  const template = getNoteTemplate(primary.templateId);
  const [fonts, artworkDataUri, backing] = await Promise.all([loadShareFonts(), loadTemplateArtwork(template), backingFor(template)]);
  const card = (
    <MemoryNoteCard
      content={primary.content}
      authorName={primary.authorName}
      templateId={primary.templateId}
      fontFamily={primary.fontFamily}
      rotation={0}
      width={cardWidth}
      artworkDataUri={artworkDataUri ?? undefined}
    />
  );

  const image = new ImageResponse(
    (
      <div style={{ width, height, display: "flex", flexDirection: "column", alignItems: "center", fontFamily: SHARE_FONT_FAMILY }}>
        {backing ? (
          <div style={{ position: "relative", display: "flex", width: cardWidth, height: cardHeight }}>
            <div style={backingStyle(backing, template, cardWidth, cardHeight)} />
            {card}
          </div>
        ) : (
          card
        )}
        {rows.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: SURROUNDING_GAP, marginTop: BLOCK_GAP, width }}>
            {rows.map((row, rowIndex) => (
              <div key={rowIndex} style={{ display: "flex", gap: SURROUNDING_GAP, justifyContent: "center" }}>
                {row.map((note, noteIndex) => (
                  <div
                    key={noteIndex}
                    style={{
                      display: "flex",
                      width: chipWidth,
                      height: SURROUNDING_CHIP_HEIGHT,
                      overflow: "hidden",
                      background: paperColorFor(note.templateId),
                      borderRadius: 10,
                      padding: 18,
                      opacity: 0.9,
                    }}
                  >
                    <span style={{ fontSize: 20, lineHeight: 1.35, color: PDF_COLORS.ink }}>{truncate(note.content, SURROUNDING_EXCERPT_CHARS)}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    ),
    { width, height, fonts }
  );

  return { png: Buffer.from(await image.arrayBuffer()), width, height };
}
