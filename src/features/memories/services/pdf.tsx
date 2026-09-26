import { renderToBuffer } from "@react-pdf/renderer";
import { getPublicMessageById } from "@/features/board/repository";
import { getShareFormat } from "@/features/sharing/config/shareFormats";
import { sloganForLanguage, toShareCardNote } from "@/features/sharing/lib/shareCardData";
import { renderShareCard } from "@/features/sharing/services/shareCardRenderer";
import { getFrameTemplate } from "../config/frameTemplates";
import { resolveCaptureRegion } from "../lib/captureRegion";
import type { MemoryProject } from "../types";
import { ensurePdfFontsRegistered, ensurePdfYogaWasmUrlConfigured } from "./fonts";
import { ensurePdfMeasureFontsLoaded } from "./pdfTextMeasure";
import { MemoryPdfDocument } from "./renderer";

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
 * SHARE IMAGE = PDF IMAGE: the PDF's entire visual content is the exact
 * same composition `renderShareCard` produces for the Share "print" format
 * (`getShareFormat("print")`), rendered at PDF_RENDER_WIDTH x
 * PDF_RENDER_HEIGHT (see above) and placed on `renderer.tsx`'s fixed
 * 4:5 page — the same
 * function, the same frame resolution (`project.frameTemplateId ? ... :
 * null`), the same `toShareCardNote`/`sloganForLanguage` mapping the
 * `/api/share/memory/[projectId]/[formatId]` route already uses. The PDF
 * never re-derives or redraws that composition itself; `renderer.tsx`
 * only wraps the resulting bytes in a one-page PDF document.
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

  const shareImage = await renderShareCard({
    primary: toShareCardNote(region.primary),
    surrounding: region.surrounding.map(toShareCardNote),
    format: { ...getShareFormat("print"), width: PDF_RENDER_WIDTH, height: PDF_RENDER_HEIGHT },
    frame,
    slogan: sloganForLanguage(message.language),
  });
  const imagePngBuffer = Buffer.from(await shareImage.arrayBuffer());

  const buffer = await renderToBuffer(<MemoryPdfDocument imagePngBuffer={imagePngBuffer} />);
  return buffer;
}
