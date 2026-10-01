import { ImageResponse } from "next/og";
import { getNoteTemplate } from "@/features/notes/config/templates";
import type { ShareCardNote } from "@/features/sharing/services/shareCardRenderer";
import { estimateMemoryCardSize, loadTemplateArtwork, MemoryNoteCard } from "@/features/sharing/services/noteCardSatori";
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

export interface PdfCardImage {
  png: Buffer;
  width: number;
  height: number;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
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

  const width = Math.round(cardWidth * 1.3);
  const chipWidth = (width - (SURROUNDING_PER_ROW - 1) * SURROUNDING_GAP) / SURROUNDING_PER_ROW;
  const rowsHeight = rows.length > 0 ? BLOCK_GAP + rows.length * SURROUNDING_CHIP_HEIGHT + (rows.length - 1) * SURROUNDING_GAP : 0;
  const height = cardHeight + rowsHeight;

  const [fonts, artworkDataUri] = await Promise.all([loadShareFonts(), loadTemplateArtwork(getNoteTemplate(primary.templateId))]);

  const image = new ImageResponse(
    (
      <div style={{ width, height, display: "flex", flexDirection: "column", alignItems: "center", fontFamily: SHARE_FONT_FAMILY }}>
        <MemoryNoteCard
          content={primary.content}
          authorName={primary.authorName}
          templateId={primary.templateId}
          fontFamily={primary.fontFamily}
          rotation={0}
          width={cardWidth}
          artworkDataUri={artworkDataUri ?? undefined}
        />
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
