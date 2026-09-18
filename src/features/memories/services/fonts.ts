import { Font } from "@react-pdf/renderer";
import { getAppUrl, getRequestOrigin } from "@/lib/env";
import { readPublicAsset } from "@/features/sharing/services/publicAsset";

export const PDF_FONT_FAMILY = "Noto Sans";
/** The Memory Print's brand/heading font — matches Share's `BRAND_FONT_FAMILY` (Fraunces), used for the footer slogan line. */
export const PDF_BRAND_FONT_FAMILY = "Fraunces";
/** A hand-styled note's real font — matches Share's `HAND_FONT_FAMILY` (Caveat), used only when the note's template has `font: "hand"`. */
export const PDF_HAND_FONT_FAMILY = "Caveat";
/** EPIC — Kart Yazı Tipi Seçenekleri: the "Daktilo" note-text choice — matches Share's `MONO_FONT_FAMILY` (Geist Mono). */
export const PDF_MONO_FONT_FAMILY = "Geist Mono";

/**
 * P0 hotfix (production PDF 500s — EPIC: PDF Worker Font Bundling): this
 * used to `readFileSync(path.join(process.cwd(), "src/features/.../assets/
 * fonts"), ...)` — a dynamic filesystem read that `next dev`/plain Node
 * satisfies but Cloudflare Workers cannot: OpenNext's file tracer can't
 * statically resolve a `process.cwd()`-built path, so the `.woff` files
 * never made it into the deployed server-function bundle, and every real
 * PDF download 500'd with `no such file or directory, readAll '/bundle/
 * .../NotoSans-Regular.woff'` (confirmed directly against a production
 * Worker tail). `readPublicAsset` (`features/sharing/services/
 * publicAsset.ts`) is this app's own proven fix for exactly this class of
 * problem — it already serves these same, byte-identical font files to
 * the Satori/Share renderer (`shareFonts.ts`'s `loadShareFonts`, reading
 * `public/fonts/share/*`) via Cloudflare's `ASSETS` binding in production
 * and a plain filesystem read under `next dev`. Reusing that exact
 * directory (rather than a second `public/fonts/pdf/` copy) is
 * deliberate: these are the same 8 files Share already ships, so one
 * asset, two readers, never two things to keep in sync.
 */
let registrationPromise: Promise<void> | null = null;

const FONT_DIR = "/fonts/share";

/**
 * Noto Sans, latin-ext subset — covers Turkish (ğşıöüçĞŞİÖÜÇ), German
 * (äöüßÄÖÜ), French, and Spanish diacritics in a single file (verified
 * directly with fontkit before committing this approach; see the EPIC 006
 * report). Fraunces/Caveat/Geist Mono reuse the exact same glyph-verified
 * WOFF assets the Share renderer already loads — never a second download
 * of the same coverage guarantee. Memoized on a shared promise (not a
 * boolean) so concurrent requests in the same Worker isolate await the
 * same in-flight registration instead of racing two loads.
 */
export function ensurePdfFontsRegistered(): Promise<void> {
  if (!registrationPromise) {
    registrationPromise = registerPdfFonts().catch((error) => {
      // A failed registration must not "succeed" on the next call — retry
      // rather than permanently caching a broken PDF renderer for the rest
      // of this isolate's lifetime.
      registrationPromise = null;
      throw error;
    });
  }
  return registrationPromise;
}

async function registerPdfFonts(): Promise<void> {
  const [notoRegular, notoBold, frauncesRegular, frauncesSemiBold, caveatRegular, caveatBold, geistMonoRegular, geistMonoBold] =
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

  Font.register({
    family: PDF_FONT_FAMILY,
    fonts: [
      { src: toFontDataUri(notoRegular), fontWeight: "normal" },
      { src: toFontDataUri(notoBold), fontWeight: "bold" },
    ],
  });
  Font.register({
    family: PDF_BRAND_FONT_FAMILY,
    fonts: [
      { src: toFontDataUri(frauncesRegular), fontWeight: "normal" },
      { src: toFontDataUri(frauncesSemiBold), fontWeight: 600 },
    ],
  });
  Font.register({
    family: PDF_HAND_FONT_FAMILY,
    fonts: [
      { src: toFontDataUri(caveatRegular), fontWeight: "normal" },
      { src: toFontDataUri(caveatBold), fontWeight: "bold" },
    ],
  });
  Font.register({
    family: PDF_MONO_FONT_FAMILY,
    fonts: [
      { src: toFontDataUri(geistMonoRegular), fontWeight: "normal" },
      { src: toFontDataUri(geistMonoBold), fontWeight: "bold" },
    ],
  });

  // Disables react-pdf's default English hyphenation dictionary, which a
  // prior EPIC (see CLAUDE.md's "PDF generation architecture") confirmed
  // reproducibly corrupts rendered text — e.g. "Every" hyphenating as
  // "E-very" and losing its leading capital in the visual output, not just
  // the text layer. A print-quality Memory Print cannot ship with that
  // defect: identity-mapping every word to itself disables hyphenation
  // outright, which is correct here since these are short note/brand
  // strings, never long unbroken paragraphs that depend on hyphenation to
  // fit a column.
  Font.registerHyphenationCallback((word) => [word]);
}

// A data: URI, not a raw Buffer: react-pdf's font loader treats `src` as a
// URL it fetches, and a data URI is the most portable way to hand it bytes
// we already have in memory without depending on filesystem path
// resolution surviving whatever bundling a deployment target does.
function toFontDataUri(buffer: ArrayBuffer): string {
  return `data:font/woff;base64,${Buffer.from(buffer).toString("base64")}`;
}

/**
 * P0 hotfix #2 (production PDF 500s — EPIC: PDF Worker Yoga WASM): `@react-
 * pdf/renderer`'s layout engine (`@react-pdf/layout` -> `yoga-layout`)
 * unconditionally loads Yoga's compiled WASM the first time any PDF is
 * rendered, completely independent of the two font fixes above. Its
 * shipped loader (`yoga-layout/dist/binaries/yoga-wasm-base64-esm.js`)
 * embeds the ~72KB WASM binary as a base64 `data:` URI and calls
 * `WebAssembly.instantiate(bytes, imports)` directly on it — Cloudflare
 * Workers refuses this exact pattern at runtime ("Wasm code generation
 * disallowed by embedder"; confirmed directly against a real Worker-
 * runtime `wrangler`/Miniflare preview, matching this project's own
 * `next/og`/Satori WASM usage, which OpenNext already patches to fetch a
 * real `.wasm` *file* and `WebAssembly.instantiateStreaming` it instead —
 * see `@opennextjs/cloudflare`'s `patch-vercel-og-library.js`).
 *
 * `patches/yoga-layout+3.2.1.patch` applies the same fix here: the same
 * WASM bytes, extracted once and shipped as a real, fetchable file
 * (`public/wasm/yoga.wasm`, served like any other public asset via
 * Cloudflare's `ASSETS` binding — confirmed `Content-Type: application/
 * wasm`, byte-identical to the original embedded data), with the
 * loader's hardcoded URL replaced by a runtime-settable global. Workers'
 * `fetch()` — unlike a browser's — has no implicit "current page" base
 * URL and throws `TypeError: Invalid URL` for a bare relative path
 * (confirmed directly), so this function must supply a genuinely
 * absolute one — but it must be the origin *actually serving this
 * request*, not necessarily the statically configured canonical site URL:
 * a same-Worker-deployment asset fetch has to target whatever host this
 * isolate is actually running behind (`localhost:8787` under a local
 * `wrangler`/OpenNext preview, a staging domain, or the real production
 * domain), and `NEXT_PUBLIC_APP_URL`/`AUTH_URL` are not guaranteed to match
 * that in every environment (confirmed directly: this project's own
 * `.env.local` points `NEXT_PUBLIC_APP_URL` at a separate staging host,
 * which would send the WASM fetch to the wrong origin entirely under a
 * local preview). `getRequestOrigin()` (`src/lib/env.ts`, EPIC 025) is
 * this app's existing mechanism for exactly this need — "the origin the
 * current request actually arrived on" — and its own doc comment already
 * prescribes falling back to `getAppUrl()` when no request context is
 * available, which is the correct behavior here too. Must run before
 * `@react-pdf/layout`'s first `Yoga.load()` call, i.e. before the first
 * `renderToBuffer()` in `pdf.tsx`; the result is cached on a global so
 * repeat calls in the same isolate are cheap no-ops once resolved.
 */
export async function ensurePdfYogaWasmUrlConfigured(): Promise<void> {
  const scope = globalThis as { __MINDOT_YOGA_WASM_URL__?: string };
  if (scope.__MINDOT_YOGA_WASM_URL__) return;
  const origin = (await getRequestOrigin()) ?? getAppUrl();
  scope.__MINDOT_YOGA_WASM_URL__ = new URL("/wasm/yoga.wasm", origin).toString();
}
