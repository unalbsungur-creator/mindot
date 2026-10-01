/**
 * Technical quality gate for Standard card artwork (`public/images/standard/web/*.png`)
 * — the files the picker, board, share card and PDF actually load. It knows
 * nothing about any card's design or template metadata: it only measures the
 * asset itself, so every future `standard-*` card is checked the same way.
 * Run by `npm run assets:validate-standard`; see src/lib/assets/validateStandardAssets.ts.
 *
 * Every alpha figure is measured on the decoded pixels (src/lib/assets/png.ts),
 * never inferred from the color type alone: "has an alpha channel" and "has a
 * transparent background" are separate checks.
 */
import { readFileSync, statSync } from "node:fs";
import { colorTypeName, decodePng, PngDecodeError, type DecodedPng } from "./png";

export const STANDARD_ASSET_LIMITS = {
  /** Hard ceiling: share card and PDF inline the artwork as base64, and Workers serve it unoptimized. */
  maxBytes: 500 * 1024,
  warnBytes: 400 * 1024,
  /** A master-sized file (the designers' 1254px exports) is never a runtime asset. */
  maxLongestSide: 1024,
  /** The "~600px" class: large enough for a 2× board card and the share card's hero. */
  recommendedLongestSide: { min: 480, max: 800 },
  /**
   * Share of the outermost pixel ring that is fully opaque (alpha 255). A
   * backdrop baked into the export (white table, beige surface) makes this
   * 100%; a cut-out card — transparent margin, or a tight crop whose paper
   * edge is antialiased — makes it ~0%. Measured on every PNG in the repo:
   * nothing sits in between, so 50% is a wide margin either way.
   */
  maxOpaqueEdgeRatio: 0.5,
  /** Alpha at or below this counts as transparent for the bounding box. */
  transparentAlpha: 8,
  /** Palette PNGs with fewer colors band visibly on textured paper. */
  minPaletteColors: 64,
  warnPaletteColors: 128,
  /** Ancillary chunks that only carry metadata (text, EXIF, color profiles, C2PA provenance, timestamps). */
  metadataChunks: ["tEXt", "zTXt", "iTXt", "eXIf", "iCCP", "tIME", "caBX"],
  /** Text/EXIF may leak authoring info; others fail only above this many bytes. */
  maxMetadataBytes: 4 * 1024,
} as const;

const PRIVATE_METADATA = new Set(["tEXt", "zTXt", "iTXt", "eXIf"]);

export type AssetVerdict = "PASS" | "WARN" | "FAIL";

export interface AssetReport {
  file: string;
  verdict: AssetVerdict;
  /** Set when the only remedy is a new export from the designer (we never clean assets automatically). */
  needsDesignerExport: boolean;
  bytes: number | null;
  width: number | null;
  height: number | null;
  colorMode: string | null;
  hasAlpha: boolean | null;
  /** Alpha at top-left, top-right, bottom-left, bottom-right. */
  cornerAlpha: [number, number, number, number] | null;
  /** Bounding box of pixels with alpha > transparentAlpha: [x0, y0, x1, y1], or null if none. */
  visibleBox: [number, number, number, number] | null;
  /** Share of the image that is transparent (alpha ≤ transparentAlpha). */
  transparentRatio: number | null;
  /** Share of the outermost pixel ring that is fully opaque. */
  opaqueEdgeRatio: number | null;
  /** Share of pixels with partial alpha (antialiasing, soft shadow). Informational. */
  partialAlphaRatio: number | null;
  paletteColors: number | null;
  metadataChunks: string[];
  failures: string[];
  warnings: string[];
}

function emptyReport(file: string): AssetReport {
  return {
    file,
    verdict: "FAIL",
    needsDesignerExport: false,
    bytes: null,
    width: null,
    height: null,
    colorMode: null,
    hasAlpha: null,
    cornerAlpha: null,
    visibleBox: null,
    transparentRatio: null,
    opaqueEdgeRatio: null,
    partialAlphaRatio: null,
    paletteColors: null,
    metadataChunks: [],
    failures: [],
    warnings: [],
  };
}

/**
 * Mean color of the fully opaque edge pixels — reported as a measured fact
 * so the designer can see what was baked in. Deliberately no "white vs.
 * textured" classification: that would be a color guess, and the remedy is
 * the same either way (a new export with a transparent background — this
 * gate never removes backgrounds automatically).
 */
function meanOpaqueEdgeColor(png: DecodedPng): string {
  const { width: W, height: H } = png.header;
  let n = 0, r = 0, g = 0, b = 0;
  const visit = (x: number, y: number) => {
    const o = (y * W + x) * 4;
    if (png.rgba[o + 3] !== 255) return;
    n++; r += png.rgba[o]; g += png.rgba[o + 1]; b += png.rgba[o + 2];
  };
  for (let x = 0; x < W; x++) { visit(x, 0); visit(x, H - 1); }
  for (let y = 1; y < H - 1; y++) { visit(0, y); visit(W - 1, y); }
  return `rgb(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)})`;
}

export function analyzeStandardAsset(file: string, buffer: Buffer): AssetReport {
  const report = emptyReport(file);
  const L = STANDARD_ASSET_LIMITS;
  report.bytes = buffer.length;

  let png: DecodedPng;
  try {
    png = decodePng(buffer);
  } catch (error) {
    report.failures.push(error instanceof PngDecodeError ? error.message : `could not decode PNG: ${String(error)}`);
    return finalize(report);
  }

  const { width: W, height: H } = png.header;
  const rgba = png.rgba;
  const alphaAt = (x: number, y: number) => rgba[(y * W + x) * 4 + 3];
  report.width = W;
  report.height = H;
  report.colorMode = `${colorTypeName(png.header.colorType)} ${png.header.bitDepth}-bit${png.paletteSize !== null ? `, ${png.paletteSize} colors` : ""}`;
  report.hasAlpha = png.hasAlpha;
  report.paletteColors = png.paletteSize;
  report.cornerAlpha = [alphaAt(0, 0), alphaAt(W - 1, 0), alphaAt(0, H - 1), alphaAt(W - 1, H - 1)];

  let transparent = 0, partial = 0;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const a = alphaAt(x, y);
      if (a <= L.transparentAlpha) {
        transparent++;
        continue;
      }
      if (a < 255) partial++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  report.visibleBox = x1 >= 0 ? [x0, y0, x1, y1] : null;
  report.transparentRatio = transparent / (W * H);
  report.partialAlphaRatio = partial / (W * H);

  let ring = 0, opaqueEdge = 0;
  const visitEdge = (x: number, y: number) => {
    ring++;
    if (alphaAt(x, y) === 255) opaqueEdge++;
  };
  for (let x = 0; x < W; x++) { visitEdge(x, 0); if (H > 1) visitEdge(x, H - 1); }
  for (let y = 1; y < H - 1; y++) { visitEdge(0, y); if (W > 1) visitEdge(W - 1, y); }
  report.opaqueEdgeRatio = opaqueEdge / ring;

  // 1–4: transparency.
  if (!png.hasAlpha) {
    report.failures.push("no alpha channel (RGB/grayscale without tRNS) — the background cannot be transparent");
  }
  if (report.opaqueEdgeRatio >= L.maxOpaqueEdgeRatio) {
    report.needsDesignerExport = true;
    report.failures.push(
      `${(report.opaqueEdgeRatio * 100).toFixed(0)}% of the image edge is fully opaque (mean ${meanOpaqueEdgeColor(png)}): a backdrop is baked into the export — needs a designer export with a transparent background`
    );
  }
  if (report.visibleBox === null) report.failures.push("image is fully transparent");

  // 6–7: size.
  const longest = Math.max(W, H);
  if (longest > L.maxLongestSide) {
    report.failures.push(`${W}×${H} is master-sized (longest side > ${L.maxLongestSide}px) — export a ~600px runtime asset`);
  } else if (longest < L.recommendedLongestSide.min || longest > L.recommendedLongestSide.max) {
    report.warnings.push(`longest side ${longest}px is outside the recommended ${L.recommendedLongestSide.min}–${L.recommendedLongestSide.max}px class`);
  }
  if (buffer.length > L.maxBytes) {
    report.failures.push(`${kb(buffer.length)} exceeds the ${kb(L.maxBytes)} limit — optimize before it can ship`);
  } else if (buffer.length > L.warnBytes) {
    report.warnings.push(`${kb(buffer.length)} is close to the ${kb(L.maxBytes)} limit`);
  }

  // 8: metadata.
  const meta = png.chunks.filter((chunk) => (L.metadataChunks as readonly string[]).includes(chunk.type));
  report.metadataChunks = meta.map((chunk) => `${chunk.type}(${chunk.length}B)`);
  const metaBytes = meta.reduce((sum, chunk) => sum + chunk.length, 0);
  const privateMeta = meta.filter((chunk) => PRIVATE_METADATA.has(chunk.type));
  if (privateMeta.length > 0) {
    report.failures.push(`text/EXIF metadata present (${privateMeta.map((c) => c.type).join(", ")}) — strip it`);
  } else if (metaBytes > L.maxMetadataBytes) {
    report.failures.push(`${kb(metaBytes)} of metadata (${[...new Set(meta.map((c) => c.type))].join(", ")}) — strip it`);
  } else if (meta.length > 0) {
    report.warnings.push(`unneeded metadata chunks: ${report.metadataChunks.join(", ")}`);
  }

  // 9: quantization.
  if (png.paletteSize !== null) {
    if (png.paletteSize < L.minPaletteColors) {
      report.failures.push(`only ${png.paletteSize} palette colors — over-quantized`);
    } else if (png.paletteSize < L.warnPaletteColors) {
      report.warnings.push(`${png.paletteSize} palette colors — check textured areas for banding`);
    }
  }

  return finalize(report);
}

function finalize(report: AssetReport): AssetReport {
  report.verdict = report.failures.length > 0 ? "FAIL" : report.warnings.length > 0 ? "WARN" : "PASS";
  return report;
}

/** Reads and analyzes one file; a missing/unreadable path becomes a FAIL report, never a throw. */
export function validateStandardAssetFile(file: string): AssetReport {
  try {
    if (!statSync(file).isFile()) {
      const report = emptyReport(file);
      report.failures.push("not a file");
      return finalize(report);
    }
    return analyzeStandardAsset(file, readFileSync(file));
  } catch (error) {
    const report = emptyReport(file);
    const code = (error as NodeJS.ErrnoException).code;
    report.failures.push(code === "ENOENT" ? "file not found" : `could not read file (${code ?? String(error)})`);
    return finalize(report);
  }
}

function kb(bytes: number): string {
  return `${Math.round(bytes / 1024)} KB`;
}
