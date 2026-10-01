/**
 * Minimal, dependency-free PNG reader for build-time asset checks
 * (`npm run assets:validate-standard`). Decodes every non-interlaced PNG
 * the PNG spec allows — grayscale, RGB, palette (incl. tRNS), gray+alpha,
 * RGBA, bit depths 1–16 — into 8-bit RGBA, so alpha is measured exactly
 * rather than estimated. Interlaced (Adam7) files are reported as
 * unsupported instead of being guessed at.
 */
import { inflateSync } from "node:zlib";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export interface PngChunk {
  type: string;
  length: number;
}

export interface PngHeader {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  interlaced: boolean;
}

export interface DecodedPng {
  header: PngHeader;
  chunks: PngChunk[];
  /** Number of PLTE entries — palette (color type 3) only. */
  paletteSize: number | null;
  /** Whether the file can carry transparency at all: an alpha channel, or a tRNS chunk. */
  hasAlpha: boolean;
  /** width × height × 4 bytes, 8 bits per channel. */
  rgba: Uint8Array;
}

export class PngDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PngDecodeError";
  }
}

const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

export function colorTypeName(colorType: number): string {
  return { 0: "grayscale", 2: "RGB", 3: "palette", 4: "grayscale+alpha", 6: "RGBA" }[colorType] ?? `unknown(${colorType})`;
}

export function isPng(buffer: Buffer): boolean {
  return buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_SIGNATURE);
}

export function decodePng(buffer: Buffer): DecodedPng {
  if (!isPng(buffer)) throw new PngDecodeError("not a PNG file (bad signature)");

  const chunks: PngChunk[] = [];
  const idat: Buffer[] = [];
  let header: PngHeader | null = null;
  let palette: Buffer | null = null;
  let trns: Buffer | null = null;

  let offset = 8;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("latin1", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) throw new PngDecodeError(`truncated ${type} chunk`);
    const data = buffer.subarray(dataStart, dataEnd);
    chunks.push({ type, length });

    if (type === "IHDR") {
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        interlaced: data[12] === 1,
      };
    } else if (type === "PLTE") palette = data;
    else if (type === "tRNS") trns = data;
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;

    offset = dataEnd + 4; // skip CRC
  }

  if (!header) throw new PngDecodeError("missing IHDR chunk");
  const channels = CHANNELS[header.colorType];
  if (channels === undefined) throw new PngDecodeError(`unsupported color type ${header.colorType}`);
  if (header.interlaced) throw new PngDecodeError("interlaced (Adam7) PNG is not supported — export non-interlaced");
  if (header.colorType === 3 && !palette) throw new PngDecodeError("palette PNG without PLTE chunk");
  if (idat.length === 0) throw new PngDecodeError("no image data (IDAT)");

  const { width, height, bitDepth, colorType } = header;
  const bitsPerPixel = channels * bitDepth;
  const bytesPerPixel = Math.max(1, bitsPerPixel >> 3);
  const stride = Math.ceil((width * bitsPerPixel) / 8);
  const raw = inflateSync(Buffer.concat(idat));
  if (raw.length < height * (stride + 1)) throw new PngDecodeError("image data is shorter than the declared size");

  // Undo the per-scanline filters (PNG spec §9).
  const pixels = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = pixels.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= bytesPerPixel ? out[i - bytesPerPixel] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= bytesPerPixel ? prev[i - bytesPerPixel] : 0;
      let value: number;
      switch (filter) {
        case 0: value = line[i]; break;
        case 1: value = line[i] + a; break;
        case 2: value = line[i] + b; break;
        case 3: value = line[i] + ((a + b) >> 1); break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          value = line[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default: throw new PngDecodeError(`invalid scanline filter ${filter}`);
      }
      out[i] = value & 0xff;
    }
  }

  const sample = (row: Buffer, index: number): number => {
    if (bitDepth === 8) return row[index];
    if (bitDepth === 16) return row.readUInt16BE(index * 2);
    const perByte = 8 / bitDepth;
    const shift = 8 - bitDepth * ((index % perByte) + 1);
    return (row[Math.floor(index / perByte)] >> shift) & ((1 << bitDepth) - 1);
  };
  const to8 = (value: number): number => (bitDepth === 16 ? value >> 8 : bitDepth === 8 ? value : Math.round((value * 255) / ((1 << bitDepth) - 1)));

  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const row = pixels.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const s = x * channels;
      if (colorType === 3) {
        const index = sample(row, x);
        rgba[o] = palette![index * 3];
        rgba[o + 1] = palette![index * 3 + 1];
        rgba[o + 2] = palette![index * 3 + 2];
        rgba[o + 3] = trns && index < trns.length ? trns[index] : 255;
      } else if (colorType === 0 || colorType === 4) {
        const raw = sample(row, s);
        const gray = to8(raw);
        rgba[o] = rgba[o + 1] = rgba[o + 2] = gray;
        if (colorType === 4) rgba[o + 3] = to8(sample(row, s + 1));
        else rgba[o + 3] = trns && trns.length >= 2 && raw === trns.readUInt16BE(0) ? 0 : 255;
      } else {
        const r = sample(row, s), g = sample(row, s + 1), b = sample(row, s + 2);
        rgba[o] = to8(r);
        rgba[o + 1] = to8(g);
        rgba[o + 2] = to8(b);
        if (colorType === 6) rgba[o + 3] = to8(sample(row, s + 3));
        else
          rgba[o + 3] =
            trns && trns.length >= 6 && r === trns.readUInt16BE(0) && g === trns.readUInt16BE(2) && b === trns.readUInt16BE(4) ? 0 : 255;
      }
    }
  }

  return {
    header,
    chunks,
    paletteSize: palette ? palette.length / 3 : null,
    hasAlpha: colorType === 4 || colorType === 6 || trns !== null,
    rgba,
  };
}
