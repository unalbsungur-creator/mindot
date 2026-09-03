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
import type { NoteDecoration, NoteShape } from "@/features/notes/types";
import { PDF_COLORS, PDF_PAPER_COLORS } from "@/features/memories/services/pdfPalette";

/** Tailwind `w-44` (11rem @ 16px root) — Note.tsx's real fixed board/world card width. Every proportion below (padding, corner-cut size, decoration size, attachment size) was measured against this and is scaled by `renderWidth / BASELINE_WIDTH`. */
const BASELINE_WIDTH = 176;

const FONT_METRICS: Record<"sans" | "hand", { charsPerLine: number; lineHeight: number; fontSize: number }> = {
  // Same measurement basis as features/notes/lib/footprint.ts (176px card,
  // ~144px of text width after padding) — reused as a *ratio* (chars per
  // line is resolution-independent), not imported, because that module's
  // exported estimate also hard-clamps to 8 lines for the DUVAR wall's
  // shared-tile capacity reasons, which don't apply here: a Memory Print
  // is a standalone hero image with its own generous whitespace, meant to
  // show a thought in full (up to MESSAGE_MAX_LENGTH, not a wall-fitting
  // excerpt).
  sans: { charsPerLine: 18, lineHeight: 21, fontSize: 15.2 },
  hand: { charsPerLine: 15, lineHeight: 23, fontSize: 18 },
};
const MAX_ESTIMATED_LINES = 20;

export interface MemoryNoteCardInput {
  content: string;
  authorName: string | null;
  templateId: string;
  /** Degrees — the note's real rotation (its board placement, or 0 for a fresh preview). */
  rotation: number;
  /** Target render width in px; height is derived from content + template, never fixed in advance. */
  width: number;
}

function estimateLineCount(content: string, charsPerLine: number): number {
  const segments = content.split("\n");
  let lines = 0;
  for (const segment of segments) lines += Math.max(1, Math.ceil(segment.length / charsPerLine));
  return Math.min(Math.max(lines, 1), MAX_ESTIMATED_LINES);
}

/**
 * The card's rendered (width, height) at the given target width — the
 * Memory Print composition needs this *before* it lays out the
 * surrounding whitespace, so it's a separate, callable estimate rather
 * than something only the card component itself knows after the fact.
 */
export function estimateMemoryCardSize(templateId: string, content: string, width: number): { width: number; height: number } {
  const template = getNoteTemplate(templateId);
  const isHeart = template.shape === "heart";
  const isPolaroid = template.shape === "polaroid";
  const scale = width / BASELINE_WIDTH;
  const metrics = FONT_METRICS[template.font];

  const lines = estimateLineCount(content, metrics.charsPerLine);
  const paddingY = isHeart ? (28 + 40) * scale : 32 * scale;
  let height = paddingY + lines * metrics.lineHeight * scale + 12 * scale + 20 * scale; // content-to-author gap + author line, reserved even if unused (matches Note.tsx's `gap-3` flex layout, negligible when authorName is absent)

  if (isHeart) height = Math.max(height, width * 1.25);
  if (isPolaroid) height += (32 + 96 - 16 + 4) * scale; // pb-8 shape padding + the top photo block, same accounting as features/notes/lib/footprint.ts

  return { width, height: Math.round(height) };
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

export function MemoryNoteCard({ content, authorName, templateId, rotation, width }: MemoryNoteCardInput): ReactNode {
  const template = getNoteTemplate(templateId);
  const isHeart = template.shape === "heart";
  const isPolaroid = template.shape === "polaroid";
  const isFolded = template.shape === "folded";
  const scale = width / BASELINE_WIDTH;
  const { height } = estimateMemoryCardSize(templateId, content, width);
  const shape = shapeStyleFor(template.shape, width, height, scale);
  const metrics = FONT_METRICS[template.font];
  const fontFamily = template.font === "hand" ? "Caveat" : "Noto Sans";
  const paperColor = PDF_PAPER_COLORS[template.paper] ?? PDF_PAPER_COLORS.white;

  const paddingStyle = isHeart
    ? { paddingLeft: 28 * scale, paddingRight: 28 * scale, paddingTop: 28 * scale, paddingBottom: 40 * scale }
    : { padding: 16 * scale };

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
          <div style={{ display: "flex", width: `calc(100% + ${32 * scale}px)`, height: 96 * scale, background: "rgba(13,27,42,0.1)", marginLeft: -16 * scale, marginTop: -16 * scale, marginBottom: 4 * scale }} />
        )}
        <span
          style={{
            display: "flex",
            fontFamily,
            fontSize: metrics.fontSize * scale,
            lineHeight: 1.4,
            color: PDF_COLORS.ink,
          }}
        >
          {content}
        </span>
        {authorName && (
          <span style={{ display: "flex", marginTop: 12 * scale, fontSize: 12 * scale, color: PDF_COLORS.inkSoft }}>— {authorName}</span>
        )}
      </div>

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
