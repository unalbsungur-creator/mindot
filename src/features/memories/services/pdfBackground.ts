import { readPublicAsset } from "@/features/sharing/services/publicAsset";
import { PDF_BACKGROUND_SIZE, type PdfBackground } from "../config/pdfBackgrounds";
import { readImageSize } from "../lib/imageSize";

const backgroundPromises = new Map<string, Promise<Buffer>>();

/**
 * A PDF Download V2 background's raw bytes (config/pdfBackgrounds.ts), read
 * once per design per isolate (the same `readPublicAsset` path the fonts and
 * card artwork use — the Worker's `ASSETS` binding in production) and handed
 * to react-pdf as a Buffer, not a base64 data URI: pdfkit embeds an opaque
 * RGB PNG's compressed data, or a JPEG's bytes, as-is, so the page costs no
 * decode/re-encode of the background.
 *
 * The card's placement is measured against the asset's pixel geometry, so
 * a replacement with different dimensions fails loudly here instead of
 * silently misplacing the card.
 */
export function loadPdfBackground(background: PdfBackground): Promise<Buffer> {
  let promise = backgroundPromises.get(background.id);
  if (!promise) {
    promise = readPublicAsset(background.asset).then((arrayBuffer) => {
      const buffer = Buffer.from(arrayBuffer);
      const size = readImageSize(buffer);
      if (size?.format !== background.assetFormat || size.width !== PDF_BACKGROUND_SIZE.width || size.height !== PDF_BACKGROUND_SIZE.height) {
        const actual = size ? `${size.format} ${size.width}x${size.height}` : "unreadable";
        throw new Error(
          `${background.asset} is ${actual}; config/pdfBackgrounds.ts expects ${background.assetFormat} ${PDF_BACKGROUND_SIZE.width}x${PDF_BACKGROUND_SIZE.height}.`
        );
      }
      return buffer;
    });
    promise.catch(() => backgroundPromises.delete(background.id));
    backgroundPromises.set(background.id, promise);
  }
  return promise;
}
