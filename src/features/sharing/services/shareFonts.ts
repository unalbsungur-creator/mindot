import { readPublicAsset } from "./publicAsset";

export const SHARE_FONT_FAMILY = "Noto Sans";
/** The Memory Print's brand/heading font — matches the live site's `--font-display` (Fraunces), not a generic substitute. See noteCardSatori.tsx for why the note's own `font-hand`/`font-sans` choice is kept separate from this. */
export const BRAND_FONT_FAMILY = "Fraunces";
/** Note.tsx's `font-hand` (Tailwind `--font-hand` -> Google's Caveat, see globals.css) — used only for a note whose template has `font: "hand"`, exactly as Note.tsx renders it. */
export const HAND_FONT_FAMILY = "Caveat";
/** EPIC — Kart Yazı Tipi Seçenekleri: the "Daktilo" note-text choice — Geist Sans's own official monospace companion (Tailwind `--font-mono`, see globals.css), matching this project's existing Vercel-flavored design system rather than introducing an unrelated monospace family. */
export const MONO_FONT_FAMILY = "Geist Mono";

export type LoadedFont = { name: string; data: ArrayBuffer; weight: 400 | 600 | 700; style: "normal" };

const FONT_DIR = "/fonts/share";

/**
 * Reuses the exact Noto Sans latin-ext files already downloaded and
 * glyph-verified for the PDF renderer (see features/memories/services/
 * fonts.ts) — copied into `public/fonts/share/` (never moved: the PDF
 * renderer keeps reading its own copies under `src/features/.../assets/
 * fonts/` via `node:fs`, unaffected) so this renderer can load them over
 * HTTP via `readPublicAsset` instead — see that module's doc comment for
 * why a `public/`-relative filesystem read doesn't work in the Cloudflare
 * Worker this app deploys to. `next/og`'s `ImageResponse` takes font bytes
 * directly (an ArrayBuffer), unlike react-pdf, so no data-URI conversion is
 * needed here.
 *
 * Fraunces (brand text) and Caveat (hand-styled note content) were added
 * for the Memory Print redesign — same verification discipline as the
 * original Noto Sans assets: downloaded as static (non-variable) WOFF
 * files — a plain variable-font TTF, tried first, fails to render at all
 * in this project's Satori build (throws on any weight/text) — and
 * confirmed via `fontkit` to have full glyph coverage for the same
 * Turkish/German/French/Spanish diacritics before being committed to
 * `assets/fonts/`.
 */
export async function loadShareFonts(): Promise<LoadedFont[]> {
  const [regular, bold, frauncesRegular, frauncesSemiBold, caveatRegular, caveatBold, geistMonoRegular, geistMonoBold] =
    await Promise.all([
      readPublicAsset(`${FONT_DIR}/NotoSans-Regular.woff`),
      readPublicAsset(`${FONT_DIR}/NotoSans-Bold.woff`),
      readPublicAsset(`${FONT_DIR}/Fraunces-Regular.woff`),
      readPublicAsset(`${FONT_DIR}/Fraunces-SemiBold.woff`),
      readPublicAsset(`${FONT_DIR}/Caveat-Regular.woff`),
      readPublicAsset(`${FONT_DIR}/Caveat-Bold.woff`),
      readPublicAsset(`${FONT_DIR}/GeistMono-Regular.woff`),
      readPublicAsset(`${FONT_DIR}/GeistMono-Bold.woff`),
    ]);

  return [
    { name: SHARE_FONT_FAMILY, data: regular, weight: 400, style: "normal" },
    { name: SHARE_FONT_FAMILY, data: bold, weight: 700, style: "normal" },
    { name: BRAND_FONT_FAMILY, data: frauncesRegular, weight: 400, style: "normal" },
    { name: BRAND_FONT_FAMILY, data: frauncesSemiBold, weight: 600, style: "normal" },
    { name: HAND_FONT_FAMILY, data: caveatRegular, weight: 400, style: "normal" },
    { name: HAND_FONT_FAMILY, data: caveatBold, weight: 700, style: "normal" },
    { name: MONO_FONT_FAMILY, data: geistMonoRegular, weight: 400, style: "normal" },
    { name: MONO_FONT_FAMILY, data: geistMonoBold, weight: 700, style: "normal" },
  ];
}
