/**
 * MASTER BACKGROUND TEMPLATE — the approved, fixed visual design for a
 * plain board-note share (Square/Story), supplied as real PNG artwork
 * rather than drawn from scratch: `public/images/share/mindot-share-
 * square.png` / `-story.png`. Everything branding-related that these
 * files already contain on their own — the MINDOT wordmark/tagline
 * header band, the soft background watermark texture, and the
 * "Aklında kalmasın." + orange dot footer — must never be redrawn by
 * this renderer; only the message-specific pieces these files can't
 * possibly contain (the real note card(s), and the message's own date)
 * are composited on top. See `renderShareCard`'s master-path branch.
 *
 * Only Square/Story have a master today — Print (2880x3600) and OG
 * (1200x630) have none, and `renderShareCard` falls back to its
 * fully-drawn Satori composition for those, unchanged.
 *
 * Current master files (verified directly, not assumed):
 *   square: 3240x3240 — exactly 3x of the 1080x1080 output, no
 *     letterboxing (`contentRegion` is the full frame).
 *   story:  3240x5760 — exactly 3x of the 1080x1920 output, but the
 *     actual design (navy header ... cream body ... footer) only
 *     occupies the middle ~79.3% of that canvas; there's a real,
 *     literal opaque-black bar baked into the file at both the top
 *     (rows 0-595, ~10.3%) and bottom (rows 5164-5759, ~10.3%) —
 *     confirmed by scanning actual pixel values, not assumed from the
 *     nominal dimensions. Compositing the full file with a plain
 *     `object-fit: cover` would put those bars directly into the final
 *     share image. `contentRegion` below records exactly which vertical
 *     slice is the real design, and `renderShareCard` uses it to
 *     effectively pre-crop the bars out before the normal "cover" scale
 *     is applied — never by writing a cropped file to disk (the master
 *     PNGs on disk are never modified), only in how this renderer reads
 *     and positions the image for compositing.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

export interface MasterSafeArea {
  /** Fraction of the *content region's* height (not the raw file's) where the header band ends and the empty hero area begins. */
  heroTop: number;
  /** Fraction of the content region's height where the hero area must end — kept below `footerTextTop` with real margin, not flush against it. */
  heroBottom: number;
  /** Fraction of canvas width reserved as a left/right margin around the hero area. */
  heroInsetX: number;
  /**
   * Fraction of the content region's height where the master's own
   * baked-in "Aklında kalmasın." text visually begins. The one dynamic
   * element this renderer still adds — the date — is placed in the gap
   * between `heroBottom` and this value, never below the master's own
   * dot (which leaves only a few px of true margin at the very bottom
   * edge — not enough for legible text, confirmed by rendering it there
   * first).
   */
  footerTextTop: number;
}

/**
 * The vertical slice of the *raw source file* that is real design
 * content, as a fraction of the file's own height — `{ top: 0, bottom: 1
 * }` means "the whole file" (Square). Measured directly by scanning for
 * near-black rows (see this file's own doc comment above) — never
 * eyeballed.
 */
export interface MasterContentRegion {
  top: number;
  bottom: number;
}

const MASTER_FILES: Record<string, string> = {
  square: "mindot-share-square.png",
  story: "mindot-share-story.png",
};

const CONTENT_REGIONS: Record<string, MasterContentRegion> = {
  square: { top: 0, bottom: 1 },
  // Measured: opaque black bars at rows 0-595 and 5164-5759 of a
  // 5760px-tall file. Rounded slightly *inward* (never outward) so the
  // crop can never include a sliver of the black bar.
  story: { top: 0.107, bottom: 0.893 },
};

/**
 * Measured directly from each master's *content region* (i.e., already
 * excluding Story's black bars above) via raw pixel-row scanning for the
 * first row containing dark ("Aklında kalmasın") pixels near the
 * horizontal center. Square's real footer text begins at ~0.929 of its
 * (full, unbarred) content height; Story's begins at ~0.954 of its
 * content region — both remarkably close, as expected for the same
 * design system at two aspect ratios.
 *
 * `footerTextTop` here is deliberately set *below* that real measurement
 * with a real margin, not flush against it — it bounds the dynamic date
 * text's box, which must stay clear of the master's own baked-in footer
 * text. (An earlier value for `square`, 0.955, sat *past* the real 0.929
 * boundary — i.e. inside the master's own footer text — and produced a
 * visible date/"Aklında kalmasın" collision; confirmed by rendering and
 * pixel-cropping the output, then fixed here.)
 */
const SAFE_AREAS: Record<string, MasterSafeArea> = {
  square: { heroTop: 0.39, heroBottom: 0.9, heroInsetX: 0.09, footerTextTop: 0.915 },
  story: { heroTop: 0.3, heroBottom: 0.92, heroInsetX: 0.09, footerTextTop: 0.965 },
};

export function getMasterSafeArea(formatId: string): MasterSafeArea | null {
  return SAFE_AREAS[formatId] ?? null;
}

export function getMasterContentRegion(formatId: string): MasterContentRegion {
  return CONTENT_REGIONS[formatId] ?? { top: 0, bottom: 1 };
}

export interface LoadedMasterImage {
  dataUri: string;
  /** The raw file's own pixel dimensions (not the output canvas's) — needed to correctly scale+position it when `contentRegion` isn't the full frame. */
  width: number;
  height: number;
}

/**
 * Reads a PNG's pixel dimensions straight from its IHDR chunk (the
 * 8-byte PNG signature, then a 4-byte chunk length, then the 4-byte
 * ASCII "IHDR", then big-endian width/height) — deliberately not using
 * an image-processing library for this: this codebase already avoids
 * bringing in a real image library for the Satori renderers, and a
 * proper one like `sharp` (present only as an undeclared transitive
 * dependency of something else, never this project's own choice) ships
 * platform-specific native binaries that are a real risk on the
 * Cloudflare Workers runtime this app deploys to (see CLAUDE.md) — not
 * worth taking on for eight bytes of header parsing.
 */
function readPngDimensions(buffer: Buffer): { width: number; height: number } {
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/** The master PNG as a `data:` URI plus its real pixel dimensions, or `null` if this format has no master (Print, OG, or any future format not listed above). Read fresh per call — same convention as `loadShareFonts`, no premature caching for a file this small. */
export function loadShareMasterImage(formatId: string): LoadedMasterImage | null {
  const filename = MASTER_FILES[formatId];
  if (!filename) return null;
  const filePath = path.join(process.cwd(), "public/images/share", filename);
  const buffer = readFileSync(filePath);
  const { width, height } = readPngDimensions(buffer);
  return { dataUri: `data:image/png;base64,${buffer.toString("base64")}`, width, height };
}
