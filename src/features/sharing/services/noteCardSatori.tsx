/**
 * Renders one real note — its actual shape, paper color, decoration,
 * attachment, font, and rotation, exactly as `Note.tsx` defines them, not
 * a flat colored rectangle — for the Memory Print share card. A parallel
 * implementation of `Note.tsx`'s `shapeClasses`/`decorationIcons`
 * geometry, not a second source of truth for it: the note's *content*
 * appearance still comes from `noteTemplates` (`paper`/`shape`/
 * `attachment`/`font`/`decoration`), the same registry `Note.tsx` reads.
 * Translation was unavoidable, not a choice — Satori (`next/og`) can't
 * consume Tailwind classes or CSS custom properties, and (verified
 * directly against this project's Satori build before writing any of
 * this) two of Note.tsx's actual CSS techniques don't survive the trip:
 * `clip-path: polygon(calc(...))` renders as an invisible box (no error,
 * no shape), and the `border-radius: X% Y% / A% B%` elliptical-corner
 * shorthand does too. Plain literal-pixel `polygon()`, `clip-path:
 * path(...)`, per-corner (single value) `border-radius`, real nested
 * `<svg>` shapes, `transform: rotate()`, and `boxShadow` all render
 * correctly and were used throughout. See the exceptions called out
 * per-shape below for exactly where and why this diverges from
 * Note.tsx's own CSS.
 *
 * `HEART_PATH` is the one piece imported directly from `Note.tsx` rather
 * than re-transcribed — a hand-precision SVG curve, not a generic
 * proportion, so copying the string by hand would be a real drift risk.
 * Every other shape here is expressed as a proportion of the card's own
 * render width, scaled by `BASELINE_WIDTH` below — never a fixed pixel
 * value — so it stays visually correct at any output resolution (a 1080px
 * social square and a multi-thousand-pixel print master both look like
 * the same design, just larger).
 */
import type { ReactNode } from "react";
import { HEART_PATH } from "@/features/notes/components/Note";
import { getNoteTemplate } from "@/features/notes/config/templates";
import { SPORTS_COLOR_HEX } from "@/features/notes/lib/sportsBall";
import type { QuoteBylineLines } from "@/features/notes/lib/quoteByline";
import { effectiveTextAlign } from "@/features/notes/lib/textAlign";
import {
  BYLINE_GAP,
  BYLINE_LINE_HEIGHT,
  CARD_BASELINE_WIDTH,
  fitBylineLine,
  HEART_TEXT_BOX,
  layoutCardText,
  SHARER_SCALE,
  type CardBylineRows,
  type CardTextLayout,
} from "@/features/notes/lib/cardText";
import type { NoteDecoration, NoteShape, NoteTemplate, NoteTextAlign, NoteTextFontFamily, SportsColorKey } from "@/features/notes/types";
import { PDF_COLORS, PDF_PAPER_COLORS } from "@/features/memories/services/pdfPalette";
import { noteDisplayContent } from "@/features/notes/lib/displayContent";
import { readPublicAsset } from "./publicAsset";

/**
 * EPIC: Special Day Clean Artwork + Share Visual Consistency — a template
 * that sets both `image` and `contentArea` (see types.ts) is image-backed
 * everywhere `Note.tsx` renders it (Picker/Preview/DUVAR); this Satori
 * renderer must agree, never silently falling back to the CSS/SVG
 * paper/shape/decoration reconstruction below for one of these templates.
 * Same predicate as `Note.tsx`'s own `isImageBacked`.
 */
export function isImageBacked(template: NoteTemplate): boolean {
  return Boolean(template.image && template.contentArea);
}

/**
 * Loads an image-backed template's real artwork as a `data:` URI — the
 * same technique `shareMasterImages.ts` already uses for the share master
 * backgrounds (Satori/`next/og` can't fetch a relative `/public` path at
 * request time, and this app's `readPublicAsset` already handles both the
 * Cloudflare ASSETS-binding and local-filesystem cases). Returns `null`
 * for a non-image-backed template so callers can treat "no artwork to
 * load" as a plain, typed case rather than an error. `Read fresh per
 * call — no premature caching, same convention as `loadShareMasterImage`.
 */
export async function loadTemplateArtwork(template: NoteTemplate): Promise<string | null> {
  if (!isImageBacked(template)) return null;
  const arrayBuffer = await readPublicAsset(template.image!);
  const buffer = Buffer.from(arrayBuffer);
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

/** Tailwind `w-44` (11rem @ 16px root) — Note.tsx's real fixed board/world card width. Every proportion below (padding, corner-cut size, decoration size, attachment size) was measured against this and is scaled by `renderWidth / BASELINE_WIDTH`. */
const BASELINE_WIDTH = CARD_BASELINE_WIDTH;

/**
 * EPIC — Kart Yazı Tipi Seçenekleri: keyed by the writer's chosen
 * `fontFamily`, not `template.font` — text typography is now fully
 * independent of the template's paper/shape styling (see
 * `features/notes/lib/textScale.ts`, the DOM equivalent of this table).
 * `family` is the literal Satori `fontFamily` string, matched to whichever
 * WOFF `shareFonts.ts` registers under that exact name.
 */
const FONT_METRICS: Record<
  NoteTextFontFamily,
  { charsPerLine: number; lineHeight: number; fontSize: number; family: string; fontWeight?: 400 | 600 | 700; letterSpacingEm?: number }
> = {
  // Same measurement basis as features/notes/lib/footprint.ts (176px card,
  // ~144px of text width after padding) — reused as a *ratio* (chars per
  // line is resolution-independent), not imported, because that module's
  // exported estimate also hard-clamps to 8 lines for the DUVAR wall's
  // shared-tile capacity reasons, which don't apply here: a Memory Print
  // is a standalone hero image with its own generous whitespace, meant to
  // show a thought in full (up to MESSAGE_MAX_LENGTH, not a wall-fitting
  // excerpt).
  modern: { charsPerLine: 18, lineHeight: 21, fontSize: 15.2, family: "Noto Sans" },
  classic: { charsPerLine: 17, lineHeight: 21, fontSize: 15.2, family: "Fraunces" },
  handwritten: { charsPerLine: 15, lineHeight: 23, fontSize: 18, family: "Caveat" },
  typewriter: { charsPerLine: 15, lineHeight: 20, fontSize: 14, family: "Geist Mono" },
  // Weight/spacing variants — each weight is a real WOFF registered in
  // shareFonts.ts (Satori never synthesizes bold), mirroring the DOM's
  // `noteFontFamilyClass` (lib/textScale.ts).
  serif: { charsPerLine: 16, lineHeight: 21, fontSize: 15.2, family: "Fraunces", fontWeight: 600 },
  mono: { charsPerLine: 15, lineHeight: 20, fontSize: 14, family: "Geist Mono", fontWeight: 700 },
  elegant: { charsPerLine: 15, lineHeight: 21, fontSize: 15.2, family: "Fraunces", letterSpacingEm: 0.06 },
  bold: { charsPerLine: 17, lineHeight: 21, fontSize: 15.2, family: "Noto Sans", fontWeight: 700 },
};

/** The Satori text style for a note's own font choice at `fontSize` px: family, weight and letter spacing together. */
function noteTextFontStyle(fontFamily: NoteTextFontFamily, fontSize: number) {
  const metrics = FONT_METRICS[fontFamily];
  return {
    fontFamily: metrics.family,
    fontWeight: metrics.fontWeight ?? 400,
    ...(metrics.letterSpacingEm ? { letterSpacing: metrics.letterSpacingEm * fontSize } : {}),
  };
}

export interface MemoryNoteCardInput {
  content: string;
  authorName: string | null;
  /**
   * MB-01: a quote's byline — "— {quote author}" in place of the author
   * line, and a smaller "shared by" line under it — already worded in the
   * note's language (`quoteBylineLines`). Absent/`null`: own words, the
   * single "— {authorName}" line exactly as before.
   */
  quote?: QuoteBylineLines | null;
  templateId: string;
  /** The writer's own text typeface — see FONT_METRICS above. */
  fontFamily: NoteTextFontFamily;
  /** The writer's alignment; absent or "auto" is the card's own, and the football disc ignores it (features/notes/lib/textAlign.ts). */
  textAlign?: NoteTextAlign;
  /** Degrees — the note's real rotation (its board placement, or 0 for a fresh preview). */
  rotation: number;
  /** Target render width in px; height is derived from content + template, never fixed in advance. */
  width: number;
  /**
   * The template's real artwork as a `data:` URI (from `loadTemplateArtwork`
   * above) — required whenever `templateId` resolves to an image-backed
   * template (`image` + `contentArea` both set); this component never falls
   * back to the CSS/SVG paper/shape/decoration reconstruction for one of
   * those, so the caller must always await `loadTemplateArtwork` first and
   * pass its result through here rather than omitting it.
   */
  artworkDataUri?: string;
}

/**
 * The card's rendered (width, height) at the given target width — the
 * Memory Print composition needs this *before* it lays out the
 * surrounding whitespace, so it's a separate, callable estimate rather
 * than something only the card component itself knows after the fact.
 */
export function estimateMemoryCardSize(
  templateId: string,
  rawContent: string,
  width: number,
  fontFamily: NoteTextFontFamily,
  /** MB-01: a quote's extra "shared by" line under the author line. */
  hasQuoteByline = false
): { width: number; height: number } {
  const template = getNoteTemplate(templateId);
  const content = noteDisplayContent(templateId, rawContent);
  const scale = width / BASELINE_WIDTH;

  // Image-backed: the card's box is the artwork's own fixed aspect ratio,
  // exactly like Note.tsx's `aspectRatio: imageWidth / imageHeight` inline
  // style — never grown by content (the message is sized to fit instead).
  if (isImageBacked(template)) {
    return { width, height: Math.round(width * (template.imageHeight! / template.imageWidth!)) };
  }
  // Fixed shapes, as in Note.tsx: the football disc is square, the heart 4:5.
  if (template.shape === "football") return { width, height: width };
  if (template.shape === "heart") return { width, height: Math.round(width * 1.25) };

  // A growing card: padding + the message's real lines (lib/cardText.ts) + the gap and the signature.
  const layout = layoutCardText({ templateId, content, fontFamily, rows: { main: true, sharer: hasQuoteByline } });
  const px = layout.geometry.bylinePx;
  let height = 32 + layout.textHeight + 12 + px * BYLINE_LINE_HEIGHT + (hasQuoteByline ? px * SHARER_SCALE * BYLINE_LINE_HEIGHT : 0);
  if (template.shape === "polaroid") height += 32 + 96 - 16 + 4; // pb-8 shape padding + the top photo block, same accounting as features/notes/lib/footprint.ts
  return { width, height: Math.round(height * scale) };
}

/**
 * `HEART_PATH`'s normalized (0..1) coordinates scaled to a real card size —
 * a raw SVG path `d` string, reusable as-is by anything that draws real
 * `<path>`/`<Path>` geometry (this file's CSS `clip-path: path(...)` below,
 * and the PDF note card's react-pdf `<Path d=...>`, which needs the same
 * scaled numbers without the CSS `path('...')` wrapper).
 */
export function scaleHeartPathData(width: number, height: number): string {
  return HEART_PATH.replace(/(-?\d*\.?\d+),(-?\d*\.?\d+)/g, (_match, x: string, y: string) => {
    return `${(parseFloat(x) * width).toFixed(2)},${(parseFloat(y) * height).toFixed(2)}`;
  });
}

function scaledHeartPath(width: number, height: number): string {
  return `path('${scaleHeartPathData(width, height)}')`;
}

/** The signature rows a card draws: a main line ("— name", or a quote's "— author") and a quote's "shared by" line. */
function bylineRowsFor(authorName: string | null, quote?: QuoteBylineLines | null): CardBylineRows {
  return quote ? { main: Boolean(quote.authorLine), sharer: Boolean(quote.sharedByLine) } : { main: Boolean(authorName), sharer: false };
}

/**
 * The card's signature (lib/cardText.ts): one line each, at the card's fixed
 * signature size, shrunk to 80% and then cut with "…" if it doesn't fit;
 * a quote's "shared by" line smaller still. `scale` = render width / 176.
 */
function SignatureSatori({
  authorName,
  quote,
  layout,
  scale,
  maxWidth,
  align,
  withGap = true,
}: {
  authorName: string | null;
  quote?: QuoteBylineLines | null;
  layout: CardTextLayout;
  scale: number;
  maxWidth: number;
  align: ReturnType<typeof textAlignStyle>;
  withGap?: boolean;
}): ReactNode {
  const px = layout.geometry.bylinePx;
  const mainText = quote ? quote.authorLine : authorName ? `— ${authorName}` : null;
  const main = mainText ? fitBylineLine(mainText, px, maxWidth) : null;
  const sharer = quote?.sharedByLine ? fitBylineLine(quote.sharedByLine, px * SHARER_SCALE, maxWidth) : null;
  if (!main && !sharer) return null;
  const line = (fit: { text: string; px: number }, extra?: Record<string, number>) => (
    <span style={{ display: "flex", fontSize: fit.px * scale, lineHeight: BYLINE_LINE_HEIGHT, whiteSpace: "nowrap", ...align, ...extra }}>{fit.text}</span>
  );
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        color: PDF_COLORS.inkSoft,
        ...(withGap ? { paddingTop: px * BYLINE_GAP * scale } : { marginTop: 12 * scale }),
        ...(align.textAlign ? { textAlign: align.textAlign } : {}),
      }}
    >
      {main && line(main)}
      {sharer && line(sharer, { opacity: 0.85 })}
    </div>
  );
}

/**
 * EPIC 044: a Satori-safe two/three-tone "ball" background for the
 * football shape — reuses `SPORTS_COLOR_HEX` (the exact same color map
 * `features/notes/lib/sportsBall.ts`'s `footballBallBackground` draws
 * from, imported directly rather than re-declared) but can't reuse that
 * function's own CSS output: it uses `conic-gradient`, which is *not* in
 * Satori's documented supported background-image list (only
 * `linear-gradient`/`radial-gradient`/solid colors are) — confirmed by
 * this file's own header comment already documenting several other CSS
 * features (calc() in clip-path, the elliptical border-radius shorthand)
 * that silently render as nothing under this exact Satori build, the same
 * failure mode a `conic-gradient` here would risk. A diagonal band split
 * (two bands for a plain primary+secondary pair, three when `accent` is
 * set) plus one soft top-left radial highlight approximates the real
 * app's wedge pattern closely enough to unmistakably read as "these two
 * (or three) colors, on a round card" — the actual requirement — without
 * depending on unsupported CSS.
 */
function footballBallBackgroundForSatori(primary: SportsColorKey, secondary: SportsColorKey, accent?: SportsColorKey): string {
  const p = SPORTS_COLOR_HEX[primary];
  const s = SPORTS_COLOR_HEX[secondary];
  const highlight = "radial-gradient(circle at 32% 28%, rgba(255,255,255,0.28), rgba(255,255,255,0) 45%)";
  const bands = accent
    ? `linear-gradient(135deg, ${p} 0%, ${p} 33%, ${s} 33%, ${s} 66%, ${SPORTS_COLOR_HEX[accent]} 66%, ${SPORTS_COLOR_HEX[accent]} 100%)`
    : `linear-gradient(135deg, ${p} 0%, ${p} 50%, ${s} 50%, ${s} 100%)`;
  return `${highlight}, ${bands}`;
}

interface ShapeResult {
  clipPath?: string;
  borderRadius?: string | number;
  extraStyle?: Record<string, string | number>;
}

/**
 * Note.tsx's `shapeClasses`, translated. Shapes with a pure-percentage
 * `clip-path` (torn, tag) are copied through unchanged — Satori handles
 * those natively. Shapes whose Tailwind arbitrary value used `calc()`
 * (craft, frost, diploma, ribbon) are rebuilt with literal pixel corner
 * cuts, scaled from the same px values Note.tsx uses at its baseline
 * width — calc() silently fails in this Satori build (verified: the
 * element renders with zero clip, not an error), so this is required, not
 * a style preference. Shapes whose Tailwind value used the elliptical
 * `X% Y% / A% B%` border-radius shorthand (confetti, bloom, burst) are
 * approximated with a single representative value per corner (also
 * verified to be Satori's actual limit — the 4-value slash form silently
 * fails the same way) — this is the one place fidelity is intentionally
 * approximate rather than exact, since Satori has no equivalent for a
 * true per-axis elliptical corner.
 */
function shapeStyleFor(shape: NoteShape, width: number, height: number, scale: number): ShapeResult {
  switch (shape) {
    case "sticky":
    case "rect":
    case "index":
    case "polaroid":
    case "notebook":
    case "folded":
      return { borderRadius: 4 * scale };
    case "minimal":
      return { borderRadius: 8 * scale, extraStyle: { border: `${Math.max(1, scale)}px solid ${PDF_COLORS.border}` } };
    case "vintage":
      return { borderRadius: 4 * scale, extraStyle: { border: `${Math.max(1, scale)}px solid rgba(0,0,0,0.05)` } };
    case "torn":
      return {
        clipPath:
          "polygon(0% 0%,100% 0%,100% 92%,94% 100%,86% 90%,78% 100%,70% 91%,62% 100%,54% 90%,46% 100%,38% 91%,30% 100%,22% 90%,14% 100%,6% 91%,0% 100%)",
      };
    case "tag":
      return { clipPath: "polygon(18% 0%,100% 0%,100% 100%,0% 100%,0% 28%)" };
    // Organic "blob" approximations — see the function doc comment above for why the exact elliptical shorthand can't be used.
    case "confetti":
      return { borderRadius: "26% 20% 26% 20%" };
    case "bloom":
      return { borderRadius: "58% 42% 42% 58%" };
    case "burst":
      return { borderRadius: "30% 68% 66% 32%" };
    case "craft": {
      const c = 14 * scale;
      return { clipPath: `polygon(${c}px 0, ${width}px 0, ${width}px ${height - c}px, ${width - c}px ${height}px, 0 ${height}px, 0 ${c}px)` };
    }
    case "frost": {
      const c = 16 * scale;
      return {
        clipPath: `polygon(${c}px 0, ${width - c}px 0, ${width}px ${c}px, ${width}px ${height - c}px, ${width - c}px ${height}px, ${c}px ${height}px, 0 ${height - c}px, 0 ${c}px)`,
      };
    }
    case "diploma": {
      const c = 22 * scale;
      return { clipPath: `polygon(0 0, ${width - c}px 0, ${width}px ${c}px, ${width}px ${height}px, 0 ${height}px)` };
    }
    case "ribbon": {
      const c = 14 * scale;
      return { clipPath: `polygon(0 ${c}px, ${c}px 0, ${width - c}px 0, ${width}px ${c}px, ${width}px ${height}px, 0 ${height}px)` };
    }
    case "heart":
      return { clipPath: scaledHeartPath(width, height) };
    // EPIC 039 shipped this as a plain circle with no color — confirmed by
    // EPIC 044's repository analysis to be the actual root cause of share
    // cards showing "just text" for a Sports template (a near-white circle
    // on a near-white/cream canvas reads as no visible card at all). Still
    // returned here (used by non-football shapes' generic border-radius
    // path, and as this shape's own outer geometry), but `MemoryNoteCard`
    // below no longer applies plain `paperColor` to it for football — see
    // its own EPIC 044 branch and `footballBallBackgroundForSatori` above.
    case "football":
      return { borderRadius: "50%" };
  }
}

/** Note.tsx's `decorationIcons`, transcribed with literal hex fills/strokes in place of Tailwind color utilities — same paths/shapes, same corner placement. */
function decorationIcon(decoration: NoteDecoration): ReactNode {
  const orange = PDF_COLORS.orange;
  const orangeSoft = PDF_COLORS.orangeSoft;
  const orangeInk = PDF_COLORS.orangeInk;
  const navy = PDF_COLORS.navy;
  const navySoft = PDF_COLORS.navySoft;

  switch (decoration) {
    case "confetti":
      return (
        <svg viewBox="0 0 20 20" width="100%" height="100%">
          <circle cx="4" cy="5" r="1.6" fill={orange} />
          <rect x="10.5" y="3" width="3" height="3" rx="0.5" fill={navySoft} transform="rotate(20 12 4.5)" />
          <circle cx="15" cy="9" r="1.3" fill={orangeSoft} />
          <rect x="4" y="11" width="2.6" height="2.6" rx="0.5" fill={navySoft} transform="rotate(-15 5.3 12.3)" />
          <circle cx="11" cy="15" r="1.4" fill={orange} />
        </svg>
      );
    case "hearts":
      return (
        <svg viewBox="0 0 20 20" width="100%" height="100%">
          <path d="M10 16.5S3.5 12.2 3.5 7.6C3.5 5 5.5 3 8 3c1 0 1.9.5 2 1.5C10.1 3.5 11 3 12 3c2.5 0 4.5 2 4.5 4.6 0 4.6-6.5 8.9-6.5 8.9Z" fill={orange} />
        </svg>
      );
    case "florals":
      return (
        <svg viewBox="0 0 20 20" width="100%" height="100%">
          <circle cx="10" cy="6" r="2.2" fill={orangeSoft} />
          <circle cx="14.5" cy="10" r="2.2" fill={orangeSoft} />
          <circle cx="10" cy="14" r="2.2" fill={orangeSoft} />
          <circle cx="5.5" cy="10" r="2.2" fill={orangeSoft} />
          <circle cx="10" cy="10" r="2" fill={orangeInk} />
        </svg>
      );
    case "compass":
      return (
        <svg viewBox="0 0 20 20" width="100%" height="100%" fill="none">
          <circle cx="10" cy="10" r="7" stroke={navy} strokeWidth="1.4" />
          <path d="M10 3v2.4M10 14.6V17M3 10h2.4M14.6 10H17" stroke={navy} strokeWidth="1.4" />
          <path d="M10 6.5 12 10l-2 3.5L8 10Z" fill={orange} />
        </svg>
      );
    case "snowflake":
      return (
        <svg viewBox="0 0 20 20" width="100%" height="100%" fill="none">
          <path d="M10 2v16M2.7 6l14.6 8M2.7 14l14.6-8" stroke={navySoft} strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      );
    case "graduation-cap":
      return (
        <svg viewBox="0 0 20 20" width="100%" height="100%">
          <path d="M10 3 18 7l-8 4-8-4Z" fill={navy} />
          <path d="M6 9v3.5c0 1.1 1.8 2 4 2s4-.9 4-2V9L10 11Z" fill={navySoft} />
          <path d="M17 7v4" stroke={orange} strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="17" cy="11.6" r="1" fill={orange} />
        </svg>
      );
    case "sparkle":
      return (
        <svg viewBox="0 0 20 20" width="100%" height="100%">
          <path d="M10 2c.4 3.6 1.4 4.6 5 5-3.6.4-4.6 1.4-5 5-.4-3.6-1.4-4.6-5-5 3.6-.4 4.6-1.4 5-5Z" fill={orange} />
          <circle cx="15.5" cy="4.5" r="1" fill={orangeSoft} />
        </svg>
      );
    case "stars":
      return (
        <svg viewBox="0 0 20 20" width="100%" height="100%">
          <path d="M8 2c.35 2.6 1.15 3.4 3.7 3.75C9.15 6.1 8.35 6.9 8 9.5c-.35-2.6-1.15-3.4-3.7-3.75C6.85 5.4 7.65 4.6 8 2Z" fill={orangeSoft} />
          <path d="M14.5 9c.25 1.9.85 2.5 2.7 2.75-1.85.25-2.45.85-2.7 2.75-.25-1.9-.85-2.5-2.7-2.75 1.85-.25 2.45-.85 2.7-2.75Z" fill={navySoft} />
        </svg>
      );
  }
}

/**
 * The Satori style for an effective alignment: nothing for "auto", so an
 * "auto" card renders exactly as before; otherwise `textAlign` for wrapped
 * text plus `justifyContent` for a flex row of text nodes (the author line).
 */
function textAlignStyle(align: NoteTextAlign): { textAlign?: "left" | "center" | "right"; justifyContent?: "flex-start" | "center" | "flex-end" } {
  if (align === "auto") return {};
  return { textAlign: align, justifyContent: align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center" };
}

export function MemoryNoteCard({ content: rawContent, authorName, quote, templateId, fontFamily, textAlign, rotation, width, artworkDataUri }: MemoryNoteCardInput): ReactNode {
  const template = getNoteTemplate(templateId);
  // The text as drawn (lib/displayContent.ts) — the same rule Note.tsx applies.
  const content = noteDisplayContent(templateId, rawContent);
  const { height } = estimateMemoryCardSize(templateId, content, width, fontFamily, Boolean(quote?.sharedByLine));
  const alignStyle = textAlignStyle(effectiveTextAlign(textAlign, template.shape));
  const scale = width / BASELINE_WIDTH;
  // The one card-text rule (features/notes/lib/cardText.ts), as Note.tsx
  // uses it: the size, the line breaks and the signature's room — scaled
  // from the 176px baseline to this render width.
  const layout = layoutCardText({ templateId, content, fontFamily, rows: bylineRowsFor(authorName, quote) });
  const fontPx = layout.fontSize * scale;
  // The computed lines, drawn as they are (`pre-line`). No `wordBreak`: the
  // line breaker already split any word too wide for the box, and this Satori
  // build's `break-word` path loops forever when a flex pass offers the text
  // less width than one character (measured: a card whose signature had
  // shrunk never finished rendering).
  const message = (extra?: Record<string, string | number>) => (
    <span
      style={{
        display: "flex",
        ...noteTextFontStyle(fontFamily, fontPx),
        fontSize: fontPx,
        lineHeight: layout.lineHeight,
        color: PDF_COLORS.ink,
        whiteSpace: "pre-line",
        ...alignStyle,
        ...extra,
      }}
    >
      {layout.lines.join("\n")}
    </span>
  );
  const signature = (maxWidth: number, align = alignStyle, withGap = true) => (
    <SignatureSatori authorName={authorName} quote={quote} layout={layout} scale={scale} maxWidth={maxWidth} align={align} withGap={withGap} />
  );

  // EPIC: Special Day Clean Artwork + Share Visual Consistency — the exact
  // same artwork + contentArea Note.tsx renders in Picker/Preview/DUVAR,
  // never the CSS/SVG reconstruction below. `artworkDataUri` is required
  // (not optional-with-fallback) for an image-backed template — a missing
  // one is a caller bug (forgot to await `loadTemplateArtwork`), not a
  // reason to silently draw the wrong card.
  if (isImageBacked(template)) {
    if (!artworkDataUri) {
      throw new Error(`MemoryNoteCard: image-backed template "${templateId}" requires artworkDataUri`);
    }
    const area = template.contentArea!;
    return (
      <div style={{ position: "relative", display: "flex", width, height, transform: `rotate(${rotation}deg)`, overflow: "hidden" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- Satori server-side render, not an optimizable next/image asset */}
        <img src={artworkDataUri} alt="" width={width} height={height} style={{ position: "absolute", top: 0, left: 0, width, height, objectFit: "contain" }} />
        <div
          style={{
            position: "absolute",
            display: "flex",
            flexDirection: "column",
            top: `${parseFloat(area.top)}%`,
            left: `${parseFloat(area.left)}%`,
            width: `${parseFloat(area.width)}%`,
            height: `${parseFloat(area.height)}%`,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, minHeight: 0, justifyContent: "center" }}>{message()}</div>
          {/* The signature at the bottom of the box, whatever the message's length. */}
          {signature(layout.geometry.bylineWidth)}
        </div>
      </div>
    );
  }

  const isHeart = template.shape === "heart";
  const isPolaroid = template.shape === "polaroid";
  const isFolded = template.shape === "folded";
  const isFootball = template.shape === "football";
  const shape = shapeStyleFor(template.shape, width, height, scale);
  const paperColor = PDF_PAPER_COLORS[template.paper] ?? PDF_PAPER_COLORS.white;

  const paddingStyle = isHeart
    ? { paddingLeft: HEART_TEXT_BOX.left * scale, paddingRight: HEART_TEXT_BOX.right * scale, paddingTop: HEART_TEXT_BOX.top * scale, paddingBottom: HEART_TEXT_BOX.bottom * scale }
    : { padding: 16 * scale };
  const centred = { textAlign: "center", justifyContent: "center" } as const;

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        width,
        transform: `rotate(${rotation}deg)`,
        boxShadow: `0 ${1 * scale}px ${2 * scale}px rgba(32,29,24,0.1), 0 ${10 * scale}px ${20 * scale}px rgba(32,29,24,0.22)`,
      }}
    >
      {isFootball ? (
        // EPIC 044: mirrors Note.tsx's real two-layer football rendering —
        // an outer, fully-opaque two-tone "ball" circle plus a smaller,
        // centered, always-light inner disc holding the actual text, at
        // Note.tsx's own proportions (disc 82% of the card, inset 18% of the
        // card on every side — lib/cardText.ts's football box).
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width,
            height,
            borderRadius: "50%",
            overflow: "hidden",
            background: footballBallBackgroundForSatori(template.primaryColor!, template.secondaryColor!, template.accentColor),
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: width * 0.82,
              height: height * 0.82,
              borderRadius: "50%",
              overflow: "hidden",
              background: PDF_PAPER_COLORS.cream,
              // Note.tsx's `p-[18%]`: a percentage padding resolves against the card's width.
              padding: width * 0.18,
              textAlign: "center",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, minHeight: 0, alignItems: "center", justifyContent: "center" }}>{message(centred)}</div>
            {signature(layout.geometry.bylineWidth, centred)}
          </div>
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width,
            height,
            background: paperColor,
            justifyContent: isHeart ? "center" : "flex-start",
            ...paddingStyle,
            ...(shape.clipPath ? { clipPath: shape.clipPath } : {}),
            ...(shape.borderRadius !== undefined ? { borderRadius: shape.borderRadius } : {}),
            ...(shape.extraStyle ?? {}),
          }}
        >
          {isPolaroid && (
            // Edge to edge across the card: the 16*scale padding on both sides cancelled by the
            // negative margin. A number, not calc() — Satori drops calc() and the strip stopped
            // one padding short of the right edge.
            <div style={{ display: "flex", width, height: 96 * scale, background: "rgba(13,27,42,0.1)", marginLeft: -16 * scale, marginTop: -16 * scale, marginBottom: 4 * scale }} />
          )}
          {isHeart ? (
            <>
              <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, minHeight: 0, justifyContent: "center" }}>{message()}</div>
              {/* Where the heart's point narrows: centred, within the heart's signature width. */}
              <div style={{ display: "flex", justifyContent: "center" }}>{signature(layout.geometry.bylineWidth, centred)}</div>
            </>
          ) : (
            // The message and the signature in a column of their own, never shrunk: placed straight in
            // the card's column, this Satori build laid the signature out beside the message's first line.
            <div style={{ display: "flex", flexDirection: "column", flexShrink: 0 }}>
              <div style={{ display: "flex", flexDirection: "column" }}>{message()}</div>
              {signature(layout.geometry.bylineWidth, alignStyle, false)}
            </div>
          )}
        </div>
      )}

      {isFolded && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: 0,
            width: 20 * scale,
            height: 20 * scale,
            background: PDF_COLORS.surface,
            clipPath: "polygon(100% 0,0 0,100% 100%)",
          }}
        />
      )}

      {template.attachment === "tape" && (
        <div
          style={{
            position: "absolute",
            top: -12 * scale,
            left: width / 2 - 28 * scale,
            width: 56 * scale,
            height: 24 * scale,
            background: "rgba(255,255,255,0.6)",
            borderRadius: 2 * scale,
            boxShadow: "0 0 0 1px rgba(0,0,0,0.05)",
            transform: "rotate(-2deg)",
          }}
        />
      )}
      {template.attachment === "pin" && (
        <div
          style={{
            position: "absolute",
            top: -8 * scale,
            left: width / 2 - 8 * scale,
            width: 16 * scale,
            height: 16 * scale,
            borderRadius: "50%",
            background: PDF_COLORS.orange,
            boxShadow: `0 0 0 ${2 * scale}px rgba(255,253,248,0.7)`,
          }}
        />
      )}

      {template.decoration && (
        <div style={{ position: "absolute", top: -6 * scale, left: -6 * scale, width: 20 * scale, height: 20 * scale, display: "flex" }}>
          {decorationIcon(template.decoration)}
        </div>
      )}
    </div>
  );
}
