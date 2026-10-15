import type { CSSProperties } from "react";
import { PDF_COLORS } from "@/features/memories/services/pdfPalette";
import type { NoteTemplate } from "@/features/notes/types";
import { decodePng, type DecodedPng } from "@/lib/assets/png";
import { isImageBacked } from "./noteCardSatori";
import { readPublicAsset } from "./publicAsset";

/** How far a `contentArea`-sized backing reaches past it, as a fraction of the card's size. */
const CONTENT_BACKING_BLEED = 0.04;
/** Where a frame's edges are sampled (and how far a card-sized backing stays inside them), as a fraction of the card. */
const EDGE_INSET = 0.015;
/** At or below this alpha a pixel counts as see-through. */
const TRANSPARENT_ALPHA = 32;

/**
 * A few image-backed cards (celebration-spark, congratulations-note) are
 * decorative frames with a genuinely transparent centre, designed to be read
 * over the board's light canvas. On a dark page (the PDF V2 navy, a dark
 * frame) their dark text would sit on that colour, so such a card gets the
 * board's canvas tone drawn *under* it — the card itself is untouched, and
 * its opaque frame still covers the backing at the edges, exactly as it
 * covers the board.
 *
 * Measured on the artwork's own alpha (once per template per isolate), not
 * listed by id: the centre of `contentArea` must be transparent. A frame
 * whose edges are opaque gets a backing the size of the whole card; anything
 * else only behind its `contentArea`, so the backing can never show around a
 * card's own outline. Every other card — opaque paper — gets none.
 *
 * Shared by every Satori renderer that puts `MemoryNoteCard` on something
 * other than the board's canvas: the PDF V2 card image and the framed share
 * image (`renderFullyDrawnShareCard`).
 */
export type CardBacking = "card" | "content" | null;
const backingCache = new Map<string, Promise<CardBacking>>();

function alphaAt(png: DecodedPng, fx: number, fy: number): number {
  const x = Math.min(png.header.width - 1, Math.max(0, Math.round(fx * png.header.width)));
  const y = Math.min(png.header.height - 1, Math.max(0, Math.round(fy * png.header.height)));
  return png.rgba[(y * png.header.width + x) * 4 + 3];
}

export function cardBackingFor(template: NoteTemplate): Promise<CardBacking> {
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

/** The backing layer's absolute position and colour inside a `position: relative` box the card's own size. */
export function cardBackingStyle(backing: Exclude<CardBacking, null>, template: NoteTemplate, width: number, height: number): CSSProperties {
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
