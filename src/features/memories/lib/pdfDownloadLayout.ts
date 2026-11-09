import { PDF_BACKGROUND_SIZE, type PdfBackground } from "../config/pdfBackgrounds";

/**
 * PDF Download V2's page geometry (renderer.tsx's `PdfDownloadDocument`),
 * kept free of react-pdf so it can be tested on its own: where the card and
 * the slogan/date/domain block land for a design and a card size.
 */

/**
 * 8 × 12 in (576 × 864 pt) — every design's own 2:3 shape, so it fills the
 * page edge to edge with no crop or letterbox. Derived from the asset size
 * rather than written down twice.
 */
export const V2_PAGE_WIDTH_PT = 576;
export const V2_PAGE_HEIGHT_PT = (V2_PAGE_WIDTH_PT * PDF_BACKGROUND_SIZE.height) / PDF_BACKGROUND_SIZE.width;
/** Points per background pixel. */
export const V2_SCALE = V2_PAGE_WIDTH_PT / PDF_BACKGROUND_SIZE.width;

/** Breathing room between the card and the frame's inner border, in background pixels. */
const CARD_WINDOW_PADDING = 26;
/** The card is never drawn larger than 0.5pt per rendered px (≈ 144 DPI). */
const MAX_CARD_SCALE = 0.5;

/**
 * Height of the slogan/date/domain block when it sits inside the frame
 * (`footer.placement === "inside"`), in points: rule 2 + 16 + slogan ~20 +
 * 16 + rule-dot-rule 6 + 14 + date ~9 + 12 + domain ~8 — renderer.tsx's
 * `FooterText`. Change both together.
 */
export const INSIDE_FOOTER_HEIGHT_PT = 104;
/**
 * The slogan's design size and letter spacing (renderer.tsx's `FooterText`),
 * and the extra height its second line takes when `layoutSlogan`
 * (sharing/lib/sloganLayout.ts) has to break it: a 1.25 line height at the
 * design size, rounded up.
 */
export const PDF_SLOGAN_FONT_SIZE_PT = 17;
export const PDF_SLOGAN_LETTER_SPACING_EM = 4.2 / 17;
export const PDF_SLOGAN_LINE_HEIGHT = 1.25;
export const PDF_SLOGAN_EXTRA_LINE_PT = 22;
/** Space between the card and an inside footer block, in points. */
const INSIDE_FOOTER_GAP_PT = 18;
/** Below placement: the domain's top edge, measured up from the page foot. */
export const BELOW_DOMAIN_OFFSET_PT = 46;
/**
 * Below placement with a two-line slogan: the domain moves this much closer
 * to the page foot, so the taller block still clears it on the design with
 * the least room under its frame (Neon).
 */
const BELOW_DOMAIN_SECOND_LINE_SHIFT_PT = 12;

export interface PdfRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PdfDownloadLayout {
  /** The usable area inside the frame (its inner border minus padding). */
  window: PdfRect;
  card: PdfRect;
  /**
   * The slogan block. `inside`: a fixed-height box that also holds the domain.
   * `below`: top and width only (its height is its content); the domain is
   * then drawn on its own at `domainTop`.
   */
  footer: { placement: "inside"; box: PdfRect } | { placement: "below"; left: number; top: number; width: number; domainTop: number };
}

/**
 * How wide the slogan may run on `design`: inside the frame, the padded
 * window the card sits in; below it, the frame's own inner width — so the
 * slogan is never wider than the frame it sits under.
 */
export function pdfSloganMaxWidth(design: PdfBackground): number {
  const { cardWindow, footer } = design;
  return (footer.placement === "inside" ? cardWindow.width - CARD_WINDOW_PADDING * 2 : cardWindow.width) * V2_SCALE;
}

/** Height of the inside-the-frame text block for a slogan drawn on `sloganLines` lines. */
export function insideFooterHeight(sloganLines: number): number {
  return INSIDE_FOOTER_HEIGHT_PT + Math.max(0, sloganLines - 1) * PDF_SLOGAN_EXTRA_LINE_PT;
}

export function layoutPdfDownload(design: PdfBackground, card: { width: number; height: number }, { sloganLines = 1 }: { sloganLines?: number } = {}): PdfDownloadLayout {
  const { cardWindow, footer } = design;
  const footerHeight = insideFooterHeight(sloganLines);
  const window: PdfRect = {
    left: (cardWindow.x + CARD_WINDOW_PADDING) * V2_SCALE,
    top: (cardWindow.y + CARD_WINDOW_PADDING) * V2_SCALE,
    width: (cardWindow.width - CARD_WINDOW_PADDING * 2) * V2_SCALE,
    height: (cardWindow.height - CARD_WINDOW_PADDING * 2) * V2_SCALE,
  };
  // Fit the card inside the window (never past it, never upscaled beyond
  // MAX_CARD_SCALE). With the text inside the frame too, the card and the
  // text block are centred together as one column.
  const reserved = footer.placement === "inside" ? INSIDE_FOOTER_GAP_PT + footerHeight : 0;
  const scale = Math.min(MAX_CARD_SCALE, window.width / card.width, (window.height - reserved) / card.height);
  const width = card.width * scale;
  const height = card.height * scale;
  const cardRect: PdfRect = {
    left: window.left + (window.width - width) / 2,
    top: window.top + (window.height - height - reserved) / 2,
    width,
    height,
  };

  if (footer.placement === "inside") {
    return {
      window,
      card: cardRect,
      footer: {
        placement: "inside",
        box: { left: window.left, top: cardRect.top + height + INSIDE_FOOTER_GAP_PT, width: window.width, height: footerHeight },
      },
    };
  }
  return {
    window,
    card: cardRect,
    footer: {
      placement: "below",
      left: 0,
      top: footer.frameBottom * V2_SCALE + footer.gap,
      width: V2_PAGE_WIDTH_PT,
      domainTop: V2_PAGE_HEIGHT_PT - BELOW_DOMAIN_OFFSET_PT + (sloganLines > 1 ? BELOW_DOMAIN_SECOND_LINE_SHIFT_PT : 0),
    },
  };
}
