import { renderToBuffer } from "@react-pdf/renderer";
import { getPublicMessageById } from "@/features/board/repository";
import { getNoteTemplate } from "@/features/notes/config/templates";
import { loadTemplateArtwork } from "@/features/sharing/services/noteCardSatori";
import { resolveCaptureRegion } from "../lib/captureRegion";
import type { MemoryProject } from "../types";
import { MemoryPdfDocument } from "./renderer";

const DEFAULT_FRAME_TEMPLATE_ID = "classic-paper";

export class MemoryPdfSourceUnavailableError extends Error {}

/**
 * Regenerates the PDF for a memory project from scratch every time,
 * rather than caching a rendered file — the capture region is
 * deterministic (see captureRegion.ts) so this always produces the same
 * output for the same project, and it keeps "what got downloaded" always
 * in sync with the source data instead of a stale render.
 */
export async function generateMemoryPdf(project: MemoryProject): Promise<Buffer> {
  const message = await getPublicMessageById(project.messageId);
  if (!message) {
    throw new MemoryPdfSourceUnavailableError("Source message is no longer public.");
  }

  const region = await resolveCaptureRegion(message, project.captureMode);
  const frameTemplateId = project.frameTemplateId ?? DEFAULT_FRAME_TEMPLATE_ID;
  // EPIC: Special Day Clean Artwork + Share Visual Consistency — same real
  // artwork Note.tsx/Share render for an image-backed template, loaded
  // once here (`undefined` for a non-image-backed template).
  const artworkDataUri = (await loadTemplateArtwork(getNoteTemplate(region.primary.templateId))) ?? undefined;

  const buffer = await renderToBuffer(
    <MemoryPdfDocument region={region} frameTemplateId={frameTemplateId} artworkDataUri={artworkDataUri} />
  );
  return buffer;
}
