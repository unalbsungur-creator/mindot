import { measureTextWidth, sloganMeasure, type PdfMeasureFont } from "@/features/memories/services/pdfTextMeasure";
import { PDF_COLORS } from "@/features/memories/services/pdfPalette";
import { layoutSlogan, type SloganLayout } from "../lib/sloganLayout";

/** Kept a hair inside the measured limit, so Satori never wraps a line `layoutSlogan` said fits. */
const SLOGAN_WIDTH_SAFETY = 0.97;
export const SHARE_SLOGAN_LINE_HEIGHT = 1.25;

export interface ShareSloganStyle {
  /** The measure font matching what Satori draws (`"bold"` = Noto Sans 700, `"modern"` = Noto Sans 400, `"serif"` = Fraunces 600). */
  font: PdfMeasureFont;
  fontFamily: string;
  fontWeight: 400 | 600 | 700;
  /** The design's own size, before any shrink. */
  fontSize: number;
  letterSpacingEm?: number;
}

/**
 * The slogan's size and line breaks for a share image (lib/sloganLayout.ts —
 * the same rule as the PDF). Needs the measure fonts loaded
 * (`ensurePdfMeasureFontsLoaded`).
 */
export function layoutShareSlogan(slogan: string, style: ShareSloganStyle, maxWidth: number): SloganLayout {
  return layoutSlogan(slogan, {
    fontSize: style.fontSize,
    maxWidth: maxWidth * SLOGAN_WIDTH_SAFETY,
    measure: sloganMeasure(style.font, style.letterSpacingEm ?? 0),
  });
}

/** Height the drawn slogan takes. */
export function shareSloganHeight(layout: SloganLayout): number {
  return layout.lines.length * layout.fontSize * SHARE_SLOGAN_LINE_HEIGHT;
}

/**
 * The slogan as `layoutShareSlogan` laid it out: each line centred on its
 * own row (never left to Satori to wrap), the last word in brand orange.
 */
export function SloganSatori({ layout, style, color, opacity }: { layout: SloganLayout; style: ShareSloganStyle; color: string; opacity?: number }) {
  const letterSpacing = (style.letterSpacingEm ?? 0) * layout.fontSize;
  const space = measureTextWidth(" ", style.font, layout.fontSize) + letterSpacing;
  return (
    // Satori rejects an `undefined` style value, so opacity is only set when given.
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", ...(opacity === undefined ? {} : { opacity }) }}>
      {layout.lines.map((line, index) => (
        <div
          key={index}
          style={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "center",
            fontFamily: style.fontFamily,
            fontWeight: style.fontWeight,
            fontSize: layout.fontSize,
            lineHeight: SHARE_SLOGAN_LINE_HEIGHT,
            letterSpacing,
            color,
            whiteSpace: "nowrap",
          }}
        >
          {line.head && <span>{line.head}</span>}
          {line.tail && <span style={{ color: PDF_COLORS.orange, marginLeft: line.head ? space : 0 }}>{line.tail}</span>}
        </div>
      ))}
    </div>
  );
}
