import { getCloudflareContext } from "@opennextjs/cloudflare";
import { renderToBuffer } from "@react-pdf/renderer";
import { matchBrowserLocale } from "@/i18n/config";
import { PRODUCTION_SITE_URL } from "@/lib/siteConfig";
import { getPublicMessageById } from "@/features/board/repository";
import { getShareFormat } from "@/features/sharing/config/shareFormats";
import { sloganForLanguage, toShareCardNote } from "@/features/sharing/lib/shareCardData";
import { renderShareCard, type ShareCardNote } from "@/features/sharing/services/shareCardRenderer";
import { getFrameTemplate, type FrameTemplate } from "../config/frameTemplates";
import { resolveCaptureRegion } from "../lib/captureRegion";
import { formatPdfDownloadDate } from "../lib/pdfDownloadDate";
import type { MemoryProject } from "../types";
import { ensurePdfFontsRegistered, ensurePdfYogaWasmUrlConfigured } from "./fonts";
import { loadPdfBackground } from "./pdfBackground";
import { ensurePdfMeasureFontsLoaded } from "./pdfTextMeasure";
import { renderPdfCardImage } from "./pdfCardImage";
import { MemoryPdfDocument, PdfDownloadDocument } from "./renderer";

export class MemoryPdfSourceUnavailableError extends Error {}

/**
 * The PDF's raster size: the Share "print" composition at half its master
 * pixel size — 1440x1800, still 4:5, i.e. 150 DPI on renderer.tsx's fixed
 * 9.6x12in page. The full 2880x3600 (300 DPI) master exceeded the
 * Cloudflare Worker memory limit: resvg holds the whole uncompressed RGBA
 * canvas, then pdfkit decompresses it again to split out the alpha channel,
 * both scaling with pixel count. Layout is proportional to the canvas, so
 * the composition is unchanged — only the pixel density is lower.
 */
const PDF_RENDER_WIDTH = 1440;
const PDF_RENDER_HEIGHT = 1800;

/**
 * Regenerates the PDF for a memory project from scratch every time,
 * rather than caching a rendered file — the capture region is
 * deterministic (see captureRegion.ts) so this always produces the same
 * output for the same project, and it keeps "what got downloaded" always
 * in sync with the source data instead of a stale render.
 *
 * Two layouts, chosen by whether the project has a frame:
 *
 * - Unframed (personal PDF, physical gift) — PDF Download V2: the card,
 *   rendered by the share image's own card component (`renderPdfCardImage`,
 *   pdfCardImage.tsx), inside the designer's background artwork
 *   (`loadPdfBackground`), with the PDF slogan, the generation date and the
 *   domain as text (`PdfDownloadDocument`, renderer.tsx). It deliberately no
 *   longer matches the share image; the share image itself is untouched by
 *   this path.
 * - Framed (digital frame): the chosen frame is a paid design, so its PDF
 *   stays the exact composition `renderShareCard` produces for the "print"
 *   format, rendered at PDF_RENDER_WIDTH x PDF_RENDER_HEIGHT (see above)
 *   and wrapped by `MemoryPdfDocument` in a one-page PDF.
 *
 * Both use the same `toShareCardNote` mapping as the share routes, so the
 * card content and author visibility agree.
 */
export async function generateMemoryPdf(project: MemoryProject): Promise<Buffer> {
  const message = await getPublicMessageById(project.messageId);
  if (!message) {
    throw new MemoryPdfSourceUnavailableError("Source message is no longer public.");
  }

  // Still required before the first `renderToBuffer()` call below — the
  // PDF page/image layout itself goes through @react-pdf/layout's Yoga
  // engine regardless of what's drawn inside it, independent of the font
  // registration calls below. See fonts.ts's own doc comment (P0 hotfix
  // #2/#5) for why this can't be skipped in a Worker runtime.
  await Promise.all([ensurePdfYogaWasmUrlConfigured(), ensurePdfFontsRegistered(), ensurePdfMeasureFontsLoaded()]);

  const region = await resolveCaptureRegion(message, project.captureMode);
  // Same "no frame chosen" behavior as the Share memory route
  // (api/share/memory/[projectId]/[formatId]/route.ts) — a personal_pdf/
  // physical_gift project never sets frameTemplateId, and previously this
  // defaulted to "classic-paper" here only, which is exactly the kind of
  // PDF-only divergence from Share this fix exists to eliminate.
  const frame = project.frameTemplateId ? getFrameTemplate(project.frameTemplateId) : null;

  const primary = toShareCardNote(region.primary);
  const surrounding = region.surrounding.map(toShareCardNote);
  return frame
    ? renderFramedMemoryPdf(primary, surrounding, frame, message.language)
    : renderUnframedMemoryPdf(primary, surrounding, message.language, new Date());
}

/** The PDF footer's brand slogan — the same fixed phrase in every language, never a card/template name. */
const PDF_DOWNLOAD_SLOGAN = "AKLINDA KALMASIN.";

/**
 * PDF Download V2 (unframed projects — personal PDF / physical gift): the
 * card inside the background artwork (renderer.tsx's PdfDownloadDocument).
 * The share image is not involved. The slogan is fixed; the date follows
 * the note's own language. `now` is when the printed date is taken from —
 * the real current time from `generateMemoryPdf`. Expects its font/Yoga
 * setup to have run.
 */
export async function renderUnframedMemoryPdf(primary: ShareCardNote, surrounding: ShareCardNote[], language: string, now: Date): Promise<Buffer> {
  const locale = matchBrowserLocale(language);
  const [background, card] = await Promise.all([loadPdfBackground(), renderPdfCardImage(primary, surrounding)]);
  return renderToBuffer(
    <PdfDownloadDocument
      background={background}
      card={card}
      slogan={PDF_DOWNLOAD_SLOGAN}
      date={formatPdfDownloadDate(now, locale, requestTimeZone())}
      domain={new URL(PRODUCTION_SITE_URL).host.toUpperCase()}
    />
  );
}

/** Framed projects (digital frame): the chosen, paid frame's share "print" composition, unchanged by V2. */
export async function renderFramedMemoryPdf(primary: ShareCardNote, surrounding: ShareCardNote[], frame: FrameTemplate, language: string): Promise<Buffer> {
  const shareImage = await renderShareCard({
    primary,
    surrounding,
    format: { ...getShareFormat("print"), width: PDF_RENDER_WIDTH, height: PDF_RENDER_HEIGHT },
    frame,
    slogan: sloganForLanguage(language),
  });
  const imagePngBuffer = Buffer.from(await shareImage.arrayBuffer());
  return renderToBuffer(<MemoryPdfDocument imagePngBuffer={imagePngBuffer} />);
}

/**
 * The downloader's IANA time zone, from Cloudflare's per-request geo data
 * (`request.cf.timezone`), so a download just after local midnight prints
 * the local day rather than the Worker's UTC one. Outside a Worker request
 * (`next dev`, scripts) there is none and the runtime default applies.
 */
function requestTimeZone(): string | undefined {
  try {
    const timezone = (getCloudflareContext().cf as { timezone?: unknown } | undefined)?.timezone;
    return typeof timezone === "string" && timezone ? timezone : undefined;
  } catch {
    return undefined;
  }
}
