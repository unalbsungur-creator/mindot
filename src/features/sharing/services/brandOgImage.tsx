import { ImageResponse } from "next/og";
import { PDF_COLORS } from "@/features/memories/services/pdfPalette";
import { BrandLockup } from "./brandMarkSatori";
import { loadShareFonts, SHARE_FONT_FAMILY } from "./shareFonts";

export const OG_IMAGE_SIZE = { width: 1200, height: 630 };

/**
 * The generic, static-content branded preview image used for route
 * segments that aren't about one specific note (the homepage, the board
 * landing page) — no DB read, so it's cheap and cacheable. A per-note
 * preview (app/memory/[messageId]/opengraph-image.tsx) uses
 * `renderShareCard` instead, since it needs that note's actual content.
 */
export function renderBrandOgImage(subtitle: string): ImageResponse {
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
        <span style={{ fontSize: 28, color: PDF_COLORS.surface, opacity: 0.85 }}>{subtitle}</span>
      </div>
    ),
    { ...OG_IMAGE_SIZE, fonts: loadShareFonts() }
  );
}
