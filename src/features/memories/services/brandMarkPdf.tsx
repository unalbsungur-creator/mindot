/**
 * The real MINDOT logo, drawn as vector PDF primitives — a react-pdf
 * translation of `features/sharing/services/brandMarkSatori.tsx`'s
 * `ShareBrandMark`/`BrandLockup`/`MemoryWatermark`/`MemorySeal`, built from
 * the exact same `DOTS`/`DOT_RADIUS` source (`components/brand/BrandMark`)
 * every other MINDOT logo instance in this codebase reads from — never a
 * redrawn or approximated logo. A parallel implementation only because
 * react-pdf and Satori/`next/og` are different render targets with
 * different component APIs (`Svg`/`Circle` from `@react-pdf/renderer`
 * here, plain `<svg>`/`<circle>` DOM tags there) — same geometry, same
 * color rules, same four exports.
 */
import { Circle, Svg, Text, View } from "@react-pdf/renderer";
import { DOT_RADIUS, DOTS } from "@/components/brand/BrandMark";
import { PDF_BRAND_FONT_FAMILY, PDF_FONT_FAMILY } from "./fonts";
import { PDF_COLORS } from "./pdfPalette";

export type PdfLogoTone = "brand" | "inverted" | "onOrange";

const TONE_COLORS: Record<PdfLogoTone, { stem: string; bowl: string }> = {
  brand: { stem: PDF_COLORS.orange, bowl: PDF_COLORS.navy },
  inverted: { stem: PDF_COLORS.orange, bowl: PDF_COLORS.surface },
  onOrange: { stem: PDF_COLORS.surface, bowl: PDF_COLORS.navy },
};

const TONE_BY_BACKGROUND: Record<string, PdfLogoTone> = {
  "#0d1b2a": "inverted",
  "#ff6a00": "onOrange",
};

export function pdfLogoToneFor(background: string): PdfLogoTone {
  return TONE_BY_BACKGROUND[background.toLowerCase()] ?? "brand";
}

/**
 * The dotted "D" mark — `size` is the mark's own width in points; height
 * follows `DOTS`' real 5.8:7.8 aspect ratio (see `MemoryPdfDocument`'s
 * prior `PdfBrandMark`, unchanged geometry, just relocated here).
 *
 * `fillOpacity` (not a wrapping `View`'s `opacity`) is deliberate: applying
 * `opacity` to a `View` that merely *contains* an `<Svg>` was verified
 * directly (rendered and rasterized) to not propagate down into the SVG's
 * own painted fills in this react-pdf build — the dots came out fully
 * opaque regardless. Setting `fillOpacity` on each `<Circle>` itself is
 * the one place that reliably worked.
 */
export function PdfBrandMark({ size, tone, fillOpacity = 1 }: { size: number; tone: PdfLogoTone; fillOpacity?: number }) {
  const colors = TONE_COLORS[tone];
  return (
    <Svg width={size} height={(size * 7.8) / 5.8} viewBox="-0.9 -0.9 5.8 7.8">
      {DOTS.map((dot) => (
        <Circle
          key={`${dot.x}-${dot.y}`}
          cx={dot.x}
          cy={dot.y}
          r={dot.variant === "landing" ? DOT_RADIUS * 1.35 : DOT_RADIUS}
          fill={dot.variant === "bowl" ? colors.bowl : colors.stem}
          fillOpacity={fillOpacity}
        />
      ))}
    </Svg>
  );
}

/** Mark + "MINDOT" wordmark, side by side — the header/footer logo lockup. */
export function PdfBrandLockup({ size, tone, inkColor }: { size: number; tone: PdfLogoTone; inkColor: string }) {
  return (
    <View style={{ display: "flex", flexDirection: "row", alignItems: "center" }}>
      <PdfBrandMark size={size} tone={tone} />
      <Text style={{ marginLeft: size * 0.4, fontFamily: PDF_FONT_FAMILY, fontWeight: "bold", fontSize: size * 0.85, color: inkColor }}>
        MINDOT
      </Text>
    </View>
  );
}

/**
 * A single, large, very-faint dot mark centered behind the whole page —
 * this page's own quiet signature, not a tiled/repeated watermark pattern.
 * Print-safe: kept at a near-invisible opacity (0.03; slightly higher than
 * Share's 0.009 since a single flat PDF fill reads fainter than an
 * anti-aliased raster PNG at the same nominal value, confirmed by
 * rendering both and comparing) — low enough it can never muddy the paper
 * underneath ink laid on top of it.
 *
 * Caller contract: this must be the *first* child of a Page whose other
 * visible children (header/hero/footer/seal) are each themselves
 * `position: "relative"` — not left `static`. Verified directly: a
 * `position: "absolute"` element paints *after* (on top of) `static`
 * siblings regardless of source order (the same CSS stacking rule this
 * project already had to work around once for `InfiniteBoard`'s DOM, now
 * showing up again in react-pdf's own layout engine) — an earlier version
 * of this watermark, absolutely positioned against otherwise-static
 * siblings, rendered fully on top of the hero note card instead of behind
 * it. Making every sibling `position: "relative"` puts them all in the
 * same "positioned" stacking group, where paint order falls back to
 * source order — watermark first (furthest back), seal last (topmost), as
 * intended.
 */
export function PdfWatermark({ pageWidth, tone }: { pageWidth: number; tone: PdfLogoTone }) {
  const size = pageWidth * 0.5;
  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <PdfBrandMark size={size} tone={tone === "inverted" ? "inverted" : "brand"} fillOpacity={0.03} />
    </View>
  );
}

/** The small circular corner seal — symbol-only, the secondary quieter brand mark distinct from the primary lockup shown once elsewhere. */
export function PdfSeal({ size, tone, ringColor, backgroundColor }: { size: number; tone: PdfLogoTone; ringColor: string; backgroundColor: string }) {
  return (
    <View
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor,
        border: `1pt solid ${ringColor}`,
      }}
    >
      <PdfBrandMark size={size * 0.4} tone={tone} />
    </View>
  );
}

/** Brand slogan line ("Aklında kalmasın." in the note's own language) — Fraunces, matching Share's footer typography. */
export function PdfSloganText({ children, fontSize, color }: { children: string; fontSize: number; color: string }) {
  return (
    <Text style={{ fontFamily: PDF_BRAND_FONT_FAMILY, fontWeight: 600, fontSize, color, textAlign: "center" }}>{children}</Text>
  );
}
