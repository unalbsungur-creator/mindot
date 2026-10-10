/**
 * The PDF Download V2 background catalog — the designer's artwork a personal
 * PDF is drawn on (renderer.tsx's `PdfDownloadDocument`). Same registry
 * philosophy as `noteTemplates`/`frameTemplates`: a design is data, read by
 * the one V2 renderer; add a design by adding an entry, never a new renderer.
 *
 * Plain data with no server imports, so the picker (client) and the renderer
 * (server) read the same list. Choosing a design is free and never stored:
 * the download route takes it as `?background=<id>` and validates it here.
 *
 * Geometry is measured on each asset's own pixels (1024×1536, opaque), never
 * assumed to match another design's — every frame sits at a different height
 * and width. `cardWindow` is the area just inside the frame's innermost
 * (dashed) border. Re-measure if an asset changes.
 */

export interface PdfBackgroundPalette {
  /** Page colour under the artwork (only visible if the image failed to cover the page). */
  page: string;
  /** Slogan text. */
  ink: string;
  /** The slogan's last word — the brand orange of the artwork's own "D". */
  accent: string;
  /** The short rule and the dot between the date rules — the frame's own colour. */
  ornament: string;
  /** Date, hairline rules and domain. */
  mist: string;
}

export interface PdfBackgroundRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfBackground {
  id: string;
  /** Design name as shown in the picker — a product name, the same in every language. */
  name: string;
  /**
   * The runtime asset embedded in the PDF. New designs ship a JPEG derivative
   * under `public/images/pdf/web/` (pdfkit embeds JPEG bytes as-is, ~80% smaller
   * than the PNG master); the designer's PNG masters in `public/images/pdf/`
   * are kept untouched and never loaded at runtime.
   */
  asset: string;
  assetFormat: "png" | "jpg";
  /** Small picker preview under `public/images/pdf/thumbs/` (240×360 WebP). */
  thumbnail: string;
  cardWindow: PdfBackgroundRect;
  /**
   * Where the slogan/date/domain block goes. `below`: under the frame, where
   * the artwork leaves a calm band — `frameBottom` is the frame's outer bottom
   * edge (background pixels), `gap` the space under it (points), and the
   * domain sits at the page foot. `inside`: under the card, inside the
   * frame's own plain window — for artwork whose lower band is busy (leaves,
   * metal bars) and would swallow the text.
   */
  footer: { placement: "below"; frameBottom: number; gap: number } | { placement: "inside" };
  palette: PdfBackgroundPalette;
}

/** Every design is drawn at this size; the PDF page is its 2:3 shape (renderer.tsx). */
export const PDF_BACKGROUND_SIZE = { width: 1024, height: 1536 } as const;

const BRAND_ORANGE = "#ff6a00";
const NIGHT_PALETTE: PdfBackgroundPalette = { page: "#001e3c", ink: "#f7f3ea", accent: BRAND_ORANGE, ornament: BRAND_ORANGE, mist: "#cfe1e8" };

export const pdfBackgrounds: readonly PdfBackground[] = [
  {
    // The original V2 artwork, unchanged — the default, so a download without
    // a choice (old clients, the admin order page) looks exactly as before.
    // Frame outer edge x 204–820, y 402–1062; dashed border x 218–805, y 416–1048.
    id: "classic",
    name: "MINDOT Classic",
    asset: "/images/pdf/mindot-pdf-background-v2-clean.png",
    assetFormat: "png",
    thumbnail: "/images/pdf/thumbs/classic.webp",
    cardWindow: { x: 219, y: 417, width: 586, height: 631 },
    footer: { placement: "below", frameBottom: 1062, gap: 30 },
    palette: NIGHT_PALETTE,
  },
  {
    // Dashed border x 219–805, y 416–1214; outer frame bottom 1238.
    id: "neon",
    name: "MINDOT Neon",
    asset: "/images/pdf/web/neon.jpg",
    assetFormat: "jpg",
    thumbnail: "/images/pdf/thumbs/neon.webp",
    cardWindow: { x: 221, y: 419, width: 582, height: 794 },
    footer: { placement: "below", frameBottom: 1238, gap: 18 },
    palette: { ...NIGHT_PALETTE, page: "#001a40" },
  },
  {
    // Dashed border x 215–808, y 388–1208; outer frame bottom 1223.
    id: "ivory-gold",
    name: "Ivory Gold",
    asset: "/images/pdf/web/ivory-gold.jpg",
    assetFormat: "jpg",
    thumbnail: "/images/pdf/thumbs/ivory-gold.webp",
    cardWindow: { x: 218, y: 390, width: 588, height: 816 },
    footer: { placement: "inside" },
    palette: { page: "#f8ead0", ink: "#14233c", accent: BRAND_ORANGE, ornament: "#b8862f", mist: "#4a5568" },
  },
  {
    // Innermost line x 237–785, y 392–1157 (a double frame with corner
    // ornaments; the outer lines sit at 213–219 / 225–227); outer bottom 1180.
    id: "noir-silver",
    name: "Noir Silver",
    asset: "/images/pdf/web/noir-silver.jpg",
    assetFormat: "jpg",
    thumbnail: "/images/pdf/thumbs/noir-silver.webp",
    cardWindow: { x: 240, y: 395, width: 544, height: 761 },
    footer: { placement: "inside" },
    palette: { page: "#0f0f0f", ink: "#f4f1ea", accent: BRAND_ORANGE, ornament: "#d1a554", mist: "#d6d2ca" },
  },
  {
    // Dashed border x 234–789, y 424–1168; outer frame bottom 1186.
    id: "botanical",
    name: "Botanical",
    asset: "/images/pdf/web/botanical.jpg",
    assetFormat: "jpg",
    thumbnail: "/images/pdf/thumbs/botanical.webp",
    cardWindow: { x: 237, y: 426, width: 550, height: 741 },
    footer: { placement: "inside" },
    palette: { page: "#02382c", ink: "#f4efe2", accent: BRAND_ORANGE, ornament: "#d4a85a", mist: "#d8e4d6" },
  },
  {
    // Dashed border x 217–807, y 385–1177; outer frame bottom 1193.
    id: "soft-gradient",
    name: "Soft Gradient",
    asset: "/images/pdf/web/soft-gradient.jpg",
    assetFormat: "jpg",
    thumbnail: "/images/pdf/thumbs/soft-gradient.webp",
    cardWindow: { x: 220, y: 387, width: 585, height: 788 },
    footer: { placement: "inside" },
    palette: { page: "#e9e4f7", ink: "#14233c", accent: BRAND_ORANGE, ornament: "#c99a3c", mist: "#4b5470" },
  },
];

export const DEFAULT_PDF_BACKGROUND_ID = "classic";

export function isPdfBackgroundId(value: unknown): value is string {
  return typeof value === "string" && pdfBackgrounds.some((background) => background.id === value);
}

/** The design for `id`, or the default one for anything unknown. Callers that must reject bad input check `isPdfBackgroundId` first. */
export function getPdfBackground(id?: string | null): PdfBackground {
  return pdfBackgrounds.find((background) => background.id === id) ?? pdfBackgrounds.find((background) => background.id === DEFAULT_PDF_BACKGROUND_ID)!;
}
