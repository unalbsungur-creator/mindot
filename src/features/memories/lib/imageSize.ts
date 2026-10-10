export interface ImageSize {
  format: "png" | "jpg";
  width: number;
  height: number;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Width/height of a PNG (IHDR) or baseline/progressive JPEG (SOFn marker),
 * read from the header only — no decode. `null` for anything else.
 */
export function readImageSize(buffer: Buffer): ImageSize | null {
  if (buffer.length >= 24 && PNG_SIGNATURE.every((byte, i) => buffer[i] === byte)) {
    return { format: "png", width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;

  let offset = 2;
  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 0xff) return null;
    const marker = buffer[offset + 1];
    // Fill bytes and standalone markers (TEM, RSTn) carry no length.
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = buffer.readUInt16BE(offset + 2);
    // SOF0–SOF15, except DHT (C4), JPG (C8) and DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (offset + 9 > buffer.length) return null;
      return { format: "jpg", height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    // Start of scan before any frame header: not a valid JPEG for our purposes.
    if (marker === 0xda) return null;
    offset += 2 + length;
  }
  return null;
}
