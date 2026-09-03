/**
 * Renders one real note as vector PDF geometry — its actual shape, paper
 * color, decoration, attachment, font, and rotation, exactly as `Note.tsx`
 * defines them — for the Memory Print PDF. A react-pdf translation of
 * `features/sharing/services/noteCardSatori.tsx`'s `MemoryNoteCard`, not a
 * second source of truth for a template's appearance: content is still
 * read from `noteTemplates` (`paper`/`shape`/`attachment`/`font`/
 * `decoration`), sizing reuses that file's own `estimateMemoryCardSize`
 * unchanged (it's pure proportional math with no Satori-specific code, so
 * a "px" input produces an equally correct "pt" output), and the heart
 * shape reuses its `scaleHeartPathData` rather than re-deriving the curve.
 *
 * The one real divergence from the Satori version: react-pdf's stylesheet
 * accepts a `clipPath` style key but treats it as a no-op (verified
 * directly against this project's `@react-pdf/stylesheet` build — it's
 * listed as `processNoopValue`), so CSS clip-path cannot cut a View's
 * silhouette here the way it does in Satori. Every non-rectangular shape
 * is instead drawn as a filled `<Svg>` `<Polygon>`/`<Path>` — real vector
 * geometry, not a raster shape — with the note's text/attachment/
 * decoration layered on top via an absolutely-positioned `<View>`. Shapes
 * that only need per-corner rounding (sticky/rect/minimal/vintage/the
 * "blob" occasion shapes) use react-pdf's native per-corner
 * `borderTopLeftRadius`-family styles directly — no SVG needed for those,
 * same as Note.tsx's own CSS approach.
 */
import type { ReactNode } from "react";
import { Circle, Path, Polygon, Rect, Svg, Text, View } from "@react-pdf/renderer";
import { scaleHeartPathData, estimateMemoryCardSize as estimateMemoryCardSizeShared } from "@/features/sharing/services/noteCardSatori";
import { getNoteTemplate } from "@/features/notes/config/templates";
import type { NoteDecoration, NoteShape } from "@/features/notes/types";
import { PDF_FONT_FAMILY, PDF_HAND_FONT_FAMILY } from "./fonts";
import { PDF_COLORS, PDF_PAPER_COLORS } from "./pdfPalette";
import { safeTextScale, wrapTextToLines } from "./pdfTextMeasure";

/**
 * Works around a confirmed react-pdf/`@react-pdf/textkit` line-breaking
 * defect: when a Text's real *last* word is the one that needs to wrap
 * (i.e., there's no trailing space/glue node after it in textkit's node
 * list), `getNextBreakpoint`'s fallback ends up choosing a breakpoint
 * *inside* that final word instead of before it — verified directly and
 * reproducibly (rendered and rasterized): "Kalite asla tesadüf
 * değildir." wrapped as "değil" / "dir.", "...an accident." as "...an a"
 * / "ccident.", across a wide range of container widths, every time the
 * broken word was the string's last one. Confirmed via bisection that
 * this is specifically triggered by this renderer's own (deliberately
 * no-op) `hyphenationCallback` — see fonts.ts's `ensurePdfFontsRegistered`
 * — combined with the word being final; disabling the callback entirely
 * also fixes it, but that reintroduces a *different*, already-documented
 * defect (CLAUDE.md: the default English hyphenation dictionary drops a
 * word's leading capital letter, e.g. "Every" → "very"). A single
 * trailing space costs nothing visually (react-pdf trims trailing
 * whitespace from the last line) and gives textkit a real glue node after
 * the final word, which was confirmed (rendered and rasterized) to fully
 * eliminate the defect while keeping the safe no-op hyphenation callback
 * intact. Apply to every dynamic string that reaches a react-pdf `<Text>`
 * and could wrap to more than one line — this note's own content, its
 * author line, a surrounding note's excerpt, and the footer slogan.
 */
export function pdfSafeText(text: string): string {
  return `${text} `;
}

/**
 * `estimateMemoryCardSize`'s height is a rough char-count heuristic, not a
 * real font-metrics measurement — deliberately shared as-is with Satori
 * (`noteCardSatori.tsx`), where being slightly short is harmless: a CSS
 * flexbox card with no `overflow:hidden` just shows a little extra
 * whitespace below the text if the estimate undercounts a wrapped line.
 * react-pdf's text layout is not that forgiving: verified directly
 * (rendered and rasterized) that when a fixed-height container is even
 * one line short of what real Noto Sans/Caveat glyph-metrics wrapping
 * needs, `@react-pdf/textkit` can hard-split a word mid-character (e.g.
 * "duvarda" rendering as "d" / "uvarda") rather than simply overflowing —
 * a defect specific to this render target, not a Share/Master regression.
 * A flat safety multiplier on top of the shared estimate, used for every
 * PDF sizing call (both the card's own layer and the page layout's
 * shrink-to-fit budget in `renderer.tsx`), gives real react-pdf wrapping
 * enough vertical headroom that this can't recur — cheaper and more
 * robust than trying to out-guess textkit's exact line-breaking with a
 * second heuristic.
 */
const PDF_HEIGHT_SAFETY_FACTOR = 1.22;

export function estimateMemoryCardSize(templateId: string, content: string, width: number): { width: number; height: number } {
  const shared = estimateMemoryCardSizeShared(templateId, content, width);
  return { width: shared.width, height: Math.round(shared.height * PDF_HEIGHT_SAFETY_FACTOR) };
}

/** Same baseline as noteCardSatori.tsx (Note.tsx's real `w-44` board/world card width) — every proportion below is scaled by `width / BASELINE_WIDTH`, so it stays correct at any print size. */
const BASELINE_WIDTH = 176;

const FONT_METRICS: Record<"sans" | "hand", { fontSize: number }> = {
  sans: { fontSize: 15.2 },
  hand: { fontSize: 18 },
};

export interface MemoryNoteCardPdfInput {
  content: string;
  authorName: string | null;
  templateId: string;
  /** Degrees — 0 for the Memory Print's hero card (matches Share's own choice: a print/share hero is shown upright, never board-tilted, for readability). */
  rotation: number;
  width: number;
}

interface ShapeDescriptor {
  kind: "rect" | "polygon" | "path";
  radii?: [number, number, number, number];
  points?: string;
  d?: string;
  border?: string;
}

function pointsFromPercent(pairs: [number, number][], width: number, height: number): string {
  return pairs.map(([px, py]) => `${((px / 100) * width).toFixed(2)},${((py / 100) * height).toFixed(2)}`).join(" ");
}

/** Corner-radius "blob" approximation for the occasion shapes (confetti/bloom/burst) — same intent as noteCardSatori.tsx's elliptical-shorthand approximation (Satori can't do it either), just expressed as react-pdf's real per-corner radii instead of a CSS shorthand string. */
function blobRadii(width: number, height: number, percents: [number, number, number, number]): [number, number, number, number] {
  const base = Math.min(width, height);
  return percents.map((p) => (p / 100) * base) as [number, number, number, number];
}

/** Note.tsx's `shapeClasses`, translated to react-pdf vector primitives — see this file's doc comment for why. */
function shapeDescriptorFor(shape: NoteShape, width: number, height: number, scale: number): ShapeDescriptor {
  switch (shape) {
    case "sticky":
    case "rect":
    case "index":
    case "polaroid":
    case "notebook":
    case "folded": {
      const r = 4 * scale;
      return { kind: "rect", radii: [r, r, r, r] };
    }
    case "minimal": {
      const r = 8 * scale;
      return { kind: "rect", radii: [r, r, r, r], border: `${Math.max(1, scale)}pt solid ${PDF_COLORS.border}` };
    }
    case "vintage": {
      const r = 4 * scale;
      return { kind: "rect", radii: [r, r, r, r], border: `${Math.max(1, scale)}pt solid rgba(0,0,0,0.08)` };
    }
    case "torn":
      return {
        kind: "polygon",
        points: pointsFromPercent(
          [[0, 0], [100, 0], [100, 92], [94, 100], [86, 90], [78, 100], [70, 91], [62, 100], [54, 90], [46, 100], [38, 91], [30, 100], [22, 90], [14, 100], [6, 91], [0, 100]],
          width,
          height
        ),
      };
    case "tag":
      return { kind: "polygon", points: pointsFromPercent([[18, 0], [100, 0], [100, 100], [0, 100], [0, 28]], width, height) };
    case "confetti":
      return { kind: "rect", radii: blobRadii(width, height, [26, 20, 26, 20]) };
    case "bloom":
      return { kind: "rect", radii: blobRadii(width, height, [58, 42, 42, 58]) };
    case "burst":
      return { kind: "rect", radii: blobRadii(width, height, [30, 68, 66, 32]) };
    case "craft": {
      const c = 14 * scale;
      return {
        kind: "polygon",
        points: [[c, 0], [width, 0], [width, height - c], [width - c, height], [0, height], [0, c]]
          .map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`)
          .join(" "),
      };
    }
    case "frost": {
      const c = 16 * scale;
      return {
        kind: "polygon",
        points: [[c, 0], [width - c, 0], [width, c], [width, height - c], [width - c, height], [c, height], [0, height - c], [0, c]]
          .map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`)
          .join(" "),
      };
    }
    case "diploma": {
      const c = 22 * scale;
      return {
        kind: "polygon",
        points: [[0, 0], [width - c, 0], [width, c], [width, height], [0, height]].map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" "),
      };
    }
    case "ribbon": {
      const c = 14 * scale;
      return {
        kind: "polygon",
        points: [[0, c], [c, 0], [width - c, 0], [width, c], [width, height], [0, height]].map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" "),
      };
    }
    case "heart":
      return { kind: "path", d: scaleHeartPathData(width, height) };
  }
}

/** Note.tsx's `decorationIcons`, translated to react-pdf's `Svg`/`Path`/`Circle`/`Rect`/`G` — same paths, same corner placement, same fills. */
function decorationIcon(decoration: NoteDecoration): ReactNode {
  const orange = PDF_COLORS.orange;
  const orangeSoft = PDF_COLORS.orangeSoft;
  const orangeInk = PDF_COLORS.orangeInk;
  const navy = PDF_COLORS.navy;
  const navySoft = PDF_COLORS.navySoft;

  switch (decoration) {
    case "confetti":
      return (
        <Svg viewBox="0 0 20 20" width="100%" height="100%">
          <Circle cx={4} cy={5} r={1.6} fill={orange} />
          <Rect x={10.5} y={3} width={3} height={3} rx={0.5} fill={navySoft} transform="rotate(20, 12, 4.5)" />
          <Circle cx={15} cy={9} r={1.3} fill={orangeSoft} />
          <Rect x={4} y={11} width={2.6} height={2.6} rx={0.5} fill={navySoft} transform="rotate(-15, 5.3, 12.3)" />
          <Circle cx={11} cy={15} r={1.4} fill={orange} />
        </Svg>
      );
    case "hearts":
      return (
        <Svg viewBox="0 0 20 20" width="100%" height="100%">
          <Path d="M10 16.5S3.5 12.2 3.5 7.6C3.5 5 5.5 3 8 3c1 0 1.9.5 2 1.5C10.1 3.5 11 3 12 3c2.5 0 4.5 2 4.5 4.6 0 4.6-6.5 8.9-6.5 8.9Z" fill={orange} />
        </Svg>
      );
    case "florals":
      return (
        <Svg viewBox="0 0 20 20" width="100%" height="100%">
          <Circle cx={10} cy={6} r={2.2} fill={orangeSoft} />
          <Circle cx={14.5} cy={10} r={2.2} fill={orangeSoft} />
          <Circle cx={10} cy={14} r={2.2} fill={orangeSoft} />
          <Circle cx={5.5} cy={10} r={2.2} fill={orangeSoft} />
          <Circle cx={10} cy={10} r={2} fill={orangeInk} />
        </Svg>
      );
    case "compass":
      return (
        <Svg viewBox="0 0 20 20" width="100%" height="100%">
          {/* A stroked-only `<Circle>` (no fill) and stroke-only `<Path>` lines were both verified — rendered and rasterized — to come out broken in this react-pdf build: the circle as an incomplete arc, the tick lines invisible entirely (`fill="none"` isn't reliably honored on these SVG primitives here, and `fillOpacity={0}` alongside a `stroke` didn't fix the circle either — it rendered as a solid disc instead). Every shape below is filled-only instead — a real annulus path (even-odd two-circle fill) for the ring, thin filled rects for the tick marks — the same fill-only technique already proven reliable everywhere else in this file. */}
          <Path
            d="M10,3 A7,7 0 1,1 10,17 A7,7 0 1,1 10,3 Z M10,4.4 A5.6,5.6 0 1,0 10,15.6 A5.6,5.6 0 1,0 10,4.4 Z"
            fill={navy}
            fillRule="evenodd"
          />
          <Rect x={9.3} y={3} width={1.4} height={2.4} fill={navy} />
          <Rect x={9.3} y={14.6} width={1.4} height={2.4} fill={navy} />
          <Rect x={3} y={9.3} width={2.4} height={1.4} fill={navy} />
          <Rect x={14.6} y={9.3} width={2.4} height={1.4} fill={navy} />
          <Path d="M10 6.5 12 10l-2 3.5L8 10Z" fill={orange} />
        </Svg>
      );
    case "snowflake":
      return (
        <Svg viewBox="0 0 20 20" width="100%" height="100%">
          {/* Three filled bars instead of stroked lines — see the "compass" case above for why stroke-only paths are avoided in this renderer. */}
          <Rect x={9.3} y={2} width={1.4} height={16} rx={0.7} fill={navySoft} />
          <Rect x={9.3} y={2} width={1.4} height={16} rx={0.7} fill={navySoft} transform="rotate(60, 10, 10)" />
          <Rect x={9.3} y={2} width={1.4} height={16} rx={0.7} fill={navySoft} transform="rotate(-60, 10, 10)" />
        </Svg>
      );
    case "graduation-cap":
      return (
        <Svg viewBox="0 0 20 20" width="100%" height="100%">
          <Path d="M10 3 18 7l-8 4-8-4Z" fill={navy} />
          <Path d="M6 9v3.5c0 1.1 1.8 2 4 2s4-.9 4-2V9L10 11Z" fill={navySoft} />
          <Rect x={16.3} y={7} width={1.4} height={4} fill={orange} />
          <Circle cx={17} cy={11.6} r={1} fill={orange} />
        </Svg>
      );
    case "sparkle":
      return (
        <Svg viewBox="0 0 20 20" width="100%" height="100%">
          <Path d="M10 2c.4 3.6 1.4 4.6 5 5-3.6.4-4.6 1.4-5 5-.4-3.6-1.4-4.6-5-5 3.6-.4 4.6-1.4 5-5Z" fill={orange} />
          <Circle cx={15.5} cy={4.5} r={1} fill={orangeSoft} />
        </Svg>
      );
    case "stars":
      return (
        <Svg viewBox="0 0 20 20" width="100%" height="100%">
          <Path d="M8 2c.35 2.6 1.15 3.4 3.7 3.75C9.15 6.1 8.35 6.9 8 9.5c-.35-2.6-1.15-3.4-3.7-3.75C6.85 5.4 7.65 4.6 8 2Z" fill={orangeSoft} />
          <Path d="M14.5 9c.25 1.9.85 2.5 2.7 2.75-1.85.25-2.45.85-2.7 2.75-.25-1.9-.85-2.5-2.7-2.75 1.85-.25 2.45-.85 2.7-2.75Z" fill={navySoft} />
        </Svg>
      );
  }
}

/**
 * The shape layer itself — filled with the paper color, either a rounded
 * `View` or real SVG vector geometry. See this file's doc comment for
 * which shapes use which.
 *
 * `fillOpacity` (default 1), not an `rgba(...)` color string: a `Path`/
 * `Polygon`'s `fill` prop was verified directly (rendered and rasterized)
 * to render as solid red instead of a translucent color when given an
 * `rgba()` string — react-pdf's SVG primitives evidently parse `fill`
 * through a different, non-alpha-aware color path than a `View`'s
 * `backgroundColor` does, and silently fall back to a red "invalid color"
 * indicator. `fillOpacity` is a real, distinct SVG attribute react-pdf
 * does support correctly (already proven by `brandMarkPdf.tsx`'s
 * watermark fix) — applied directly on the same primitive that has the
 * fill, same principle both places.
 */
function ShapeFill({ shape, width, height, paperColor, fillOpacity = 1 }: { shape: ShapeDescriptor; width: number; height: number; paperColor: string; fillOpacity?: number }) {
  if (shape.kind === "rect") {
    const [tl, tr, br, bl] = shape.radii!;
    return (
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width,
          height,
          backgroundColor: paperColor,
          opacity: fillOpacity,
          borderTopLeftRadius: tl,
          borderTopRightRadius: tr,
          borderBottomRightRadius: br,
          borderBottomLeftRadius: bl,
          ...(shape.border ? { border: shape.border } : {}),
        }}
      />
    );
  }
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ position: "absolute", top: 0, left: 0 }}>
      {shape.kind === "polygon" ? (
        <Polygon points={shape.points!} fill={paperColor} fillOpacity={fillOpacity} />
      ) : (
        <Path d={shape.d!} fill={paperColor} fillOpacity={fillOpacity} />
      )}
    </Svg>
  );
}

/**
 * A flat, low-opacity duplicate of the card's own real silhouette, offset
 * slightly down-right — the print-safe stand-in for the CSS `boxShadow`
 * Satori uses (react-pdf's stylesheet has no shadow/blur support). Reuses
 * the exact same `ShapeFill` geometry as the card itself (heart/torn/
 * craft/... included), not a generic bounding-box rectangle — a plain
 * rect shadow was verified to visibly peek out past a concave shape's own
 * edges (confirmed on the heart template: the rectangle showed through
 * the heart's top notch and both side curves), which is exactly the
 * "kenarları temiz olmalı" (clean edges) failure this EPIC's print-quality
 * section warns against. Kept as one crisp, very light shape rather than
 * anything trying to fake blur — a shadow must never "çamurlaşmamalı"
 * (turn muddy), and a single ~8% opacity flat shape never can.
 */
function ShadowLayer({ shape, width, height }: { shape: ShapeDescriptor; width: number; height: number }) {
  const offset = Math.max(2, width * 0.012);
  return (
    <View style={{ position: "absolute", top: offset, left: offset, width, height }}>
      <ShapeFill shape={shape} width={width} height={height} paperColor={PDF_COLORS.ink} fillOpacity={0.08} />
    </View>
  );
}

export function MemoryNoteCardPdf({ content, authorName, templateId, rotation, width }: MemoryNoteCardPdfInput) {
  const template = getNoteTemplate(templateId);
  const isHeart = template.shape === "heart";
  const isPolaroid = template.shape === "polaroid";
  const isFolded = template.shape === "folded";
  const scale = width / BASELINE_WIDTH;
  const { height } = estimateMemoryCardSize(templateId, content, width);
  const shape = shapeDescriptorFor(template.shape, width, height, scale);
  const metrics = FONT_METRICS[template.font];
  const fontFamily = template.font === "hand" ? PDF_HAND_FONT_FAMILY : PDF_FONT_FAMILY;
  const paperColor = PDF_PAPER_COLORS[template.paper] ?? PDF_PAPER_COLORS.white;

  const paddingStyle = isHeart
    ? { paddingLeft: 28 * scale, paddingRight: 28 * scale, paddingTop: 28 * scale, paddingBottom: 40 * scale }
    : { padding: 16 * scale };
  const paddingX = isHeart ? 28 * scale : 16 * scale;
  const innerWidth = width - paddingX * 2;

  // Guaranteed-fit text: shrink font size only if the content's single
  // widest word genuinely can't fit the box at all, then wrap every line
  // break ourselves with real glyph metrics rather than letting react-pdf's
  // own textkit decide — see pdfTextMeasure.ts's doc comment for the two
  // independent, confirmed (rendered and rasterized) defects this avoids:
  // a too-wide lone word getting hard-split mid-character, and — separately
  // — a word that fits alone still getting hard-split when textkit's own
  // greedy line-fill narrowly overflows adding it to a part-filled line.
  // Shrinking/wrapping only ever affects the text; the card's own shape/
  // decoration/padding keep their normal geometry scale, so ordinary
  // content (no unusually long word, no narrow-overflow line) renders
  // pixel-identically to before this existed.
  const contentTextScale = safeTextScale(content, template.font, metrics.fontSize, scale, innerWidth);
  const contentFontSize = metrics.fontSize * contentTextScale;
  const wrappedContent = wrapTextToLines(content, template.font, contentFontSize, innerWidth).join("\n");

  const authorLine = authorName ? `— ${authorName}` : null;
  const authorTextScale = authorLine ? safeTextScale(authorLine, "sans", 12, scale, innerWidth) : scale;
  const authorFontSize = 12 * authorTextScale;
  const wrappedAuthor = authorLine ? wrapTextToLines(authorLine, "sans", authorFontSize, innerWidth).join("\n") : null;

  return (
    <View style={{ position: "relative", width, height, transform: `rotate(${rotation}deg)` }}>
      <ShadowLayer shape={shape} width={width} height={height} />
      <ShapeFill shape={shape} width={width} height={height} paperColor={paperColor} />

      {isPolaroid && (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width,
            height: 96 * scale,
            backgroundColor: "rgba(13,27,42,0.1)",
          }}
        />
      )}

      <View style={{ position: "absolute", top: 0, left: 0, width, height, display: "flex", flexDirection: "column", justifyContent: isHeart ? "center" : "flex-start", ...paddingStyle }}>
        <Text style={{ fontFamily, fontSize: contentFontSize, lineHeight: 1.4, color: PDF_COLORS.ink }}>{pdfSafeText(wrappedContent)}</Text>
        {wrappedAuthor && (
          <Text style={{ marginTop: 12 * scale, fontSize: authorFontSize, color: PDF_COLORS.inkSoft }}>{pdfSafeText(wrappedAuthor)}</Text>
        )}
      </View>

      {isFolded && (
        <Svg width={20 * scale} height={20 * scale} viewBox={`0 0 ${20 * scale} ${20 * scale}`} style={{ position: "absolute", top: 0, right: 0 }}>
          <Polygon points={`${20 * scale},0 0,0 ${20 * scale},${20 * scale}`} fill={PDF_COLORS.surface} />
        </Svg>
      )}

      {template.attachment === "tape" && (
        <View
          style={{
            position: "absolute",
            top: -12 * scale,
            left: width / 2 - 28 * scale,
            width: 56 * scale,
            height: 24 * scale,
            backgroundColor: "rgba(255,255,255,0.6)",
            borderRadius: 2 * scale,
            transform: "rotate(-2deg)",
          }}
        />
      )}
      {template.attachment === "pin" && (
        <View
          style={{
            position: "absolute",
            top: -8 * scale,
            left: width / 2 - 8 * scale,
            width: 16 * scale,
            height: 16 * scale,
            borderRadius: 8 * scale,
            backgroundColor: PDF_COLORS.orange,
            border: `${2 * scale}pt solid rgba(255,253,248,0.7)`,
          }}
        />
      )}

      {template.decoration && (
        <View style={{ position: "absolute", top: -6 * scale, left: -6 * scale, width: 20 * scale, height: 20 * scale }}>
          {decorationIcon(template.decoration)}
        </View>
      )}
    </View>
  );
}
