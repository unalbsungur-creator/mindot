import { PDF_COLORS } from "@/features/memories/services/pdfPalette";

export type LogoTone = "brand" | "inverted" | "onOrange";

const LOGO_TONE_COLORS: Record<LogoTone, { stem: string; bowl: string }> = {
  brand: { stem: PDF_COLORS.orange, bowl: PDF_COLORS.navy },
  inverted: { stem: PDF_COLORS.orange, bowl: PDF_COLORS.surface },
  onOrange: { stem: PDF_COLORS.surface, bowl: PDF_COLORS.navy },
};

const LOGO_TONE_BY_BACKGROUND: Record<string, LogoTone> = {
  "#0d1b2a": "inverted",
  "#ff6a00": "onOrange",
};

export function logoToneFor(background: string): LogoTone {
  return LOGO_TONE_BY_BACKGROUND[background.toLowerCase()] ?? "brand";
}

/**
 * The dotted D, drawn with plain positioned `div`s (not `<svg>`) — the
 * same technique already proven to render correctly through Satori in
 * app/icon.tsx, parameterized on the same tone/color roles BrandMark.tsx
 * uses so this is never a second source of truth for the logo's geometry
 * or its color rules. Shared by every `next/og`-based renderer in
 * features/sharing (share cards and the OG/Twitter preview images) —
 * never redrawn per-renderer.
 */
export function ShareBrandMark({ cell, tone }: { cell: number; tone: LogoTone }) {
  const colors = LOGO_TONE_COLORS[tone];
  const dot = cell * 0.62 * 2;
  const dotBig = dot * 1.35;

  const dots = [
    { x: 0, y: 0, color: colors.stem }, { x: 1, y: 0, color: colors.bowl }, { x: 2, y: 0, color: colors.bowl },
    { x: 0, y: 1, color: colors.stem }, { x: 3, y: 1, color: colors.bowl },
    { x: 0, y: 2, color: colors.stem }, { x: 4, y: 2, color: colors.bowl },
    { x: 0, y: 3, color: colors.stem }, { x: 4, y: 3, color: colors.stem, big: true },
    { x: 0, y: 4, color: colors.stem }, { x: 4, y: 4, color: colors.bowl },
    { x: 0, y: 5, color: colors.stem }, { x: 3, y: 5, color: colors.bowl },
    { x: 0, y: 6, color: colors.stem }, { x: 1, y: 6, color: colors.bowl }, { x: 2, y: 6, color: colors.bowl },
  ];

  return (
    <div style={{ position: "relative", width: 4 * cell, height: 6 * cell, display: "flex" }}>
      {dots.map((d) => {
        const size = d.big ? dotBig : dot;
        return (
          <div
            key={`${d.x}-${d.y}`}
            style={{
              position: "absolute",
              left: d.x * cell - size / 2,
              top: d.y * cell - size / 2,
              width: size,
              height: size,
              borderRadius: "50%",
              background: d.color,
              display: "flex",
            }}
          />
        );
      })}
    </div>
  );
}

export function BrandLockup({ cell, tone, inkColor }: { cell: number; tone: LogoTone; inkColor: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      <ShareBrandMark cell={cell} tone={tone} />
      <span style={{ marginLeft: cell * 2.2, fontSize: cell * 5, fontWeight: 700, color: inkColor }}>MINDOT</span>
    </div>
  );
}

/**
 * EPIC: Premium Memory Print branding — level 1, "ana marka": the same
 * dot mark as `BrandLockup`, just rendered very large and very faint,
 * absolutely centered behind everything else on the canvas. Not a
 * generic tiled/repeated watermark pattern — one large mark, so it reads
 * as "this page's own quiet signature" rather than a stock-photo
 * watermark stamped across the image. The caller is responsible for
 * giving its container `position: "relative"` and placing this as the
 * *first* child so normal paint order puts every other element on top.
 */
export function MemoryWatermark({ canvasWidth, tone }: { canvasWidth: number; tone: LogoTone }) {
  const cell = canvasWidth * 0.075;
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.009 }}>
      <ShareBrandMark cell={cell} tone={tone === "inverted" ? "inverted" : "brand"} />
    </div>
  );
}

/**
 * EPIC: Premium Memory Print branding — level 2, "yuvarlak mühür": a
 * small circular seal in one corner, symbol-only (no wordmark) — the
 * secondary, quieter brand mark a physical print's corner stamp would
 * carry, distinct from the primary lockup already shown once elsewhere
 * in the composition.
 */
export function MemorySeal({ size, tone, ringColor, backgroundColor }: { size: number; tone: LogoTone; ringColor: string; backgroundColor: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: "50%",
        background: backgroundColor,
        boxShadow: `0 0 0 1px ${ringColor}`,
      }}
    >
      <ShareBrandMark cell={size * 0.11} tone={tone} />
    </div>
  );
}
