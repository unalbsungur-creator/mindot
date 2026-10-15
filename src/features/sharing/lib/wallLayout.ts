/**
 * Where each card goes on a personal wall's share image (square 1080×1080,
 * story 1080×1920). Pure: the caller measures each card first — its
 * height/width ratio from `estimateMemoryCardSize`, which is linear in
 * width — so this file needs no fonts, artwork, database or renderer.
 *
 * The rules (product decisions):
 * - at most 4 cards on a square, 8 on a story, in the given order, left to
 *   right then top to bottom;
 * - square: 1 card alone, 2 side by side, 3 as 2 + 1 (the last one
 *   centred), 4 as 2 × 2; story: 1 alone, 2–3 stacked in one column, 4–8 in
 *   two columns;
 * - every card is the same width; a row is as tall as its tallest card;
 *   a lone column is never wider than MAX_SINGLE_CARD_WIDTH;
 * - when the cards don't fit, every card shrinks by the same scale;
 * - a card narrower than MIN_CARD_WIDTH is unreadable, so cards are dropped
 *   from the end until the rest reach it. One card is always kept; if even
 *   one card can't reach it the layout says so (`readable: false`).
 */

export type WallFormat = "square" | "story";

/** The widest a card may be when it stands in a column on its own. */
export const MAX_SINGLE_CARD_WIDTH = 560;
/** Narrower than this, a card's text stops being readable (measured on real renders, Alt iş 3A/3D). */
export const MIN_CARD_WIDTH = 280;
export const MAX_WALL_CARDS: Record<WallFormat, number> = { square: 4, story: 8 };

export interface WallLayoutMetrics {
  width: number;
  height: number;
  padding: number;
  headerHeight: number;
  footerHeight: number;
  gap: number;
}

/** The share image's fixed proportions: margins, the logo/name header, the slogan footer and the gap between cards. */
export function wallLayoutMetrics(width: number, height: number): WallLayoutMetrics {
  return { width, height, padding: width * 0.07, headerHeight: width * 0.16, footerHeight: width * 0.06, gap: width * 0.03 };
}

export interface PlacedWallCard {
  /** Position in the input order. */
  index: number;
  row: number;
  column: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WallLayout {
  cards: PlacedWallCard[];
  /** Input indices per row. */
  rows: number[][];
  columns: number;
  /** The one width every card is drawn at. */
  cardWidth: number;
  /** cardWidth / the width the cards would have had without shrinking to fit (1 = no shrink). */
  scale: number;
  /** Input indices left out, from the end: past the format's maximum, or dropped to keep cards readable. */
  excluded: number[];
  /** False only when even a single card stays below MIN_CARD_WIDTH. */
  readable: boolean;
}

function columnsFor(format: WallFormat, count: number): number {
  if (count <= 1) return 1;
  if (format === "story" && count <= 3) return 1;
  return 2;
}

function place(format: WallFormat, aspects: number[], m: WallLayoutMetrics) {
  const columns = columnsFor(format, aspects.length);
  const rows: number[][] = [];
  for (let i = 0; i < aspects.length; i += columns) rows.push(aspects.slice(i, i + columns).map((_, k) => i + k));

  const contentWidth = m.width - m.padding * 2;
  const contentHeight = m.height - m.padding * 2 - m.headerHeight - m.footerHeight;
  const tallest = rows.map((row) => Math.max(...row.map((i) => aspects[i])));
  const gridHeight = (width: number) => tallest.reduce((sum, aspect) => sum + aspect * width, 0) + m.gap * (rows.length - 1);

  const naturalWidth = columns === 1 ? Math.min(MAX_SINGLE_CARD_WIDTH, contentWidth) : (contentWidth - m.gap * (columns - 1)) / columns;
  // Shrink to fit exactly: only the cards scale, the gaps between rows don't
  // (scaling the whole grid height, gaps included, would still overflow).
  const fitWidth = (contentHeight - m.gap * (rows.length - 1)) / tallest.reduce((sum, aspect) => sum + aspect, 0);
  const cardWidth = Math.min(naturalWidth, fitWidth);

  // Centred both ways in the space between the header and the footer; a row
  // shorter than the column count (square 2 + 1) is centred on its own.
  const cards: PlacedWallCard[] = [];
  let y = m.padding + m.headerHeight + (contentHeight - gridHeight(cardWidth)) / 2;
  rows.forEach((row, r) => {
    const rowHeight = tallest[r] * cardWidth;
    const rowWidth = row.length * cardWidth + m.gap * (row.length - 1);
    let x = m.padding + (contentWidth - rowWidth) / 2;
    row.forEach((index, column) => {
      const height = aspects[index] * cardWidth;
      cards.push({ index, row: r, column, x, y: y + (rowHeight - height) / 2, width: cardWidth, height });
      x += cardWidth + m.gap;
    });
    y += rowHeight + m.gap;
  });
  return { cards, rows, columns, cardWidth, scale: cardWidth / naturalWidth };
}

/**
 * Lays out cards given their height/width ratios, in order. Indices in the
 * result refer to `aspects`.
 */
export function layoutWallCards(format: WallFormat, aspects: number[], metrics: WallLayoutMetrics): WallLayout {
  if (aspects.length === 0) return { cards: [], rows: [], columns: 0, cardWidth: 0, scale: 1, excluded: [], readable: true };
  const all = aspects.map((_, i) => i);
  for (let count = Math.min(aspects.length, MAX_WALL_CARDS[format]); count >= 1; count--) {
    const layout = place(format, aspects.slice(0, count), metrics);
    if (layout.cardWidth >= MIN_CARD_WIDTH || count === 1) {
      return { ...layout, excluded: all.slice(count), readable: layout.cardWidth >= MIN_CARD_WIDTH };
    }
  }
  throw new Error("unreachable");
}
