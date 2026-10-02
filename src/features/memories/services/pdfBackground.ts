import { readPublicAsset } from "@/features/sharing/services/publicAsset";
import { PDF_BACKGROUND_SIZE } from "./renderer";

/** PDF Download V2's background (see renderer.tsx's PdfDownloadDocument) — the designer's language-free artwork. */
export const PDF_BACKGROUND_PATH = "/images/pdf/mindot-pdf-background-v2-clean.png";

let backgroundPromise: Promise<Buffer> | null = null;

/**
 * The background PNG's raw bytes, read once per isolate (the same
 * `readPublicAsset` path the fonts and card artwork use — the Worker's
 * `ASSETS` binding in production) and handed to react-pdf as a Buffer, not
 * a base64 data URI: pdfkit embeds an opaque RGB PNG's compressed image data
 * as-is, so the page costs no decode/re-encode of the background.
 *
 * The card's placement is measured against this asset's pixel geometry, so
 * a replacement with different dimensions fails loudly here instead of
 * silently misplacing the card.
 */
export function loadPdfBackground(): Promise<Buffer> {
  if (!backgroundPromise) {
    backgroundPromise = readPublicAsset(PDF_BACKGROUND_PATH)
      .then((arrayBuffer) => {
        const buffer = Buffer.from(arrayBuffer);
        const width = buffer.readUInt32BE(16);
        const height = buffer.readUInt32BE(20);
        if (width !== PDF_BACKGROUND_SIZE.width || height !== PDF_BACKGROUND_SIZE.height) {
          throw new Error(`${PDF_BACKGROUND_PATH} is ${width}x${height}; renderer.tsx is measured against ${PDF_BACKGROUND_SIZE.width}x${PDF_BACKGROUND_SIZE.height}.`);
        }
        return buffer;
      })
      .catch((error) => {
        backgroundPromise = null;
        throw error;
      });
  }
  return backgroundPromise;
}
