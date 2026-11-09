import { ImageResponse } from "next/og";
import { PDF_COLORS } from "@/features/memories/services/pdfPalette";
import { ensurePdfMeasureFontsLoaded } from "@/features/memories/services/pdfTextMeasure";
import { BrandLockup } from "./brandMarkSatori";
import { loadShareFonts, SHARE_FONT_FAMILY } from "./shareFonts";
import { layoutShareSlogan, SloganSatori, type ShareSloganStyle } from "./sloganSatori";

/** Side margin the slogan keeps inside the 1200px-wide image. */
const OG_SLOGAN_MARGIN_X = 120;

export const OG_IMAGE_SIZE = { width: 1200, height: 630 };

/**
 * The generic, static-content branded preview image used for route
 * segments that aren't about one specific note (the homepage, the board
 * landing page) — no DB read, so it's cheap and cacheable. A per-note
 * preview (app/memory/[messageId]/opengraph-image.tsx) uses
 * `renderShareCard` instead, since it needs that note's actual content.
 */
export async function renderBrandOgImage(subtitle: string): Promise<ImageResponse> {
  // The measure fonts: the subtitle (always the brand slogan) is laid out like every other slogan — lib/sloganLayout.ts.
  const [fonts] = await Promise.all([loadShareFonts(), ensurePdfMeasureFontsLoaded()]);
  const style: ShareSloganStyle = { font: "modern", fontFamily: SHARE_FONT_FAMILY, fontWeight: 400, fontSize: 28 };
  const layout = layoutShareSlogan(subtitle, style, OG_IMAGE_SIZE.width - OG_SLOGAN_MARGIN_X * 2);
  return new ImageResponse(
    (
      <div
        style={{
          width: OG_IMAGE_SIZE.width,
          height: OG_IMAGE_SIZE.height,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 28,
          background: PDF_COLORS.navy,
          fontFamily: SHARE_FONT_FAMILY,
        }}
      >
        <BrandLockup cell={20} tone="inverted" inkColor={PDF_COLORS.surface} />
        <SloganSatori layout={layout} style={style} color={PDF_COLORS.surface} opacity={0.85} />
      </div>
    ),
    { ...OG_IMAGE_SIZE, fonts }
  );
}
