/**
 * `npm test` — the Standard card asset gate (standardAssetValidation.ts).
 * Synthetic PNGs are built in-test with a tiny encoder so every rule is
 * exercised by an exact, known input; the committed runtime asset and (when
 * present locally) a real candidate master are checked as-is.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { deflateSync } from "node:zlib";
import { decodePng } from "./png";
import { analyzeStandardAsset, STANDARD_ASSET_LIMITS, validateStandardAssetFile } from "./standardAssetValidation";
import { runStandardAssetGate } from "./validateStandardAssets";

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(data: Buffer): number {
  let c = 0xffffffff;
  for (const byte of data) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

interface EncodeOptions {
  colorType: 2 | 3 | 6;
  palette?: number[][];
  trns?: number[];
  extraChunks?: [string, Buffer][];
  interlaced?: boolean;
}
/** `pixel(x, y)` returns RGB(A) for color types 2/6, or a palette index for type 3. */
function encodePng(width: number, height: number, pixel: (x: number, y: number) => number[], options: EncodeOptions): Buffer {
  const channels = options.colorType === 6 ? 4 : options.colorType === 2 ? 3 : 1;
  const raw = Buffer.alloc(height * (width * channels + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * channels + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const values = pixel(x, y);
      for (let c = 0; c < channels; c++) raw[y * (width * channels + 1) + 1 + x * channels + c] = values[c];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = options.colorType;
  ihdr[12] = options.interlaced ? 1 : 0;
  const parts = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr)];
  if (options.palette) parts.push(chunk("PLTE", Buffer.from(options.palette.flat())));
  if (options.trns) parts.push(chunk("tRNS", Buffer.from(options.trns)));
  for (const [type, data] of options.extraChunks ?? []) parts.push(chunk(type, data));
  parts.push(chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0)));
  return Buffer.concat(parts);
}

/** A cut-out card: transparent margin, a soft 1px alpha edge, yellow paper. */
const validCard = (x: number, y: number) => {
  const inside = x >= 40 && x < 560 && y >= 40 && y < 540;
  const edge = inside && (x === 40 || x === 559 || y === 40 || y === 539);
  return inside ? [246, 216, 110, edge ? 160 : 255] : [0, 0, 0, 0];
};

const tmp = mkdtempSync(path.join(tmpdir(), "mindot-assets-"));
after(() => rmSync(tmp, { recursive: true, force: true }));
function writeTmp(name: string, data: Buffer): string {
  const file = path.join(tmp, name);
  writeFileSync(file, data);
  return file;
}

describe("PNG decoder", () => {
  it("decodes palette + tRNS exactly", () => {
    const png = decodePng(encodePng(2, 1, (x) => [x], { colorType: 3, palette: [[255, 0, 0], [0, 0, 255]], trns: [0, 200] }));
    assert.deepEqual([...png.rgba], [255, 0, 0, 0, 0, 0, 255, 200]);
    assert.equal(png.hasAlpha, true);
  });

  it("reports an RGB file as having no alpha", () => {
    const png = decodePng(encodePng(1, 1, () => [1, 2, 3], { colorType: 2 }));
    assert.deepEqual([...png.rgba], [1, 2, 3, 255]);
    assert.equal(png.hasAlpha, false);
  });
});

describe("Standard card asset gate", () => {
  it("passes the committed classic runtime asset", () => {
    const report = validateStandardAssetFile("public/images/standard/web/classic-mindot.png");
    assert.equal(report.verdict, "PASS", report.failures.concat(report.warnings).join("; "));
    assert.equal(report.hasAlpha, true);
    assert.equal(report.opaqueEdgeRatio, 0);
  });

  it("passes a valid cut-out card", () => {
    const report = analyzeStandardAsset("valid.png", encodePng(600, 580, validCard, { colorType: 6 }));
    assert.equal(report.verdict, "PASS", report.failures.join("; "));
    assert.deepEqual(report.cornerAlpha, [0, 0, 0, 0]);
    assert.deepEqual(report.visibleBox, [40, 40, 559, 539]);
  });

  it("fails an opaque RGB card on a white backdrop", () => {
    const report = analyzeStandardAsset(
      "rgb.png",
      encodePng(600, 600, (x, y) => (x > 50 && x < 550 && y > 50 && y < 550 ? [240, 180, 180] : [254, 254, 254]), { colorType: 2 })
    );
    assert.equal(report.verdict, "FAIL");
    assert.equal(report.hasAlpha, false);
    assert.equal(report.needsDesignerExport, true);
    assert.ok(report.failures.some((f) => f.includes("no alpha channel")));
  });

  it("fails a quote-like RGBA export whose textured backdrop is fully opaque", () => {
    // Alpha channel present, but every pixel is opaque: beige "table" around a cream card.
    const quoteLike = (x: number, y: number) => {
      const noise = (x * 7 + y * 13) % 9;
      const card = x > 30 && x < 570 && y > 30 && y < 570;
      return card ? [238 - noise, 228 - noise, 210 - noise, 255] : [222 - noise, 207 - noise, 187 - noise, 255];
    };
    const report = analyzeStandardAsset("quote-like.png", encodePng(600, 600, quoteLike, { colorType: 6 }));
    assert.equal(report.hasAlpha, true);
    assert.equal(report.verdict, "FAIL");
    assert.equal(report.needsDesignerExport, true);
    assert.equal(report.opaqueEdgeRatio, 1);
  });

  it("fails an asset over the size limits", () => {
    // Incompressible noise, alpha kept just below 255 so only the size rules can trip.
    const noise = randomBytes(700 * 700 * 4);
    const report = analyzeStandardAsset(
      "big.png",
      encodePng(700, 700, (x, y) => {
        const o = (y * 700 + x) * 4;
        return [noise[o], noise[o + 1], noise[o + 2], 250 + (noise[o + 3] % 5)];
      }, { colorType: 6 })
    );
    assert.equal(report.verdict, "FAIL");
    assert.ok(report.failures.some((f) => f.includes("exceeds")));
    const master = analyzeStandardAsset("master.png", encodePng(1254, 1254, (x, y) => (x < 2 || y < 2 ? [0, 0, 0, 0] : [246, 216, 110, 250]), { colorType: 6 }));
    assert.ok(master.failures.some((f) => f.includes("master-sized")));
  });

  it("fails over-quantized palettes, text metadata, interlacing and non-PNG input", () => {
    const grayPalette = Array.from({ length: 16 }, (_, i) => [i * 16, i * 16, i * 16]);
    const banded = analyzeStandardAsset(
      "banded.png",
      encodePng(600, 580, (x) => [x % 16], { colorType: 3, palette: grayPalette, trns: Array.from({ length: 16 }, (_, i) => (i === 0 ? 0 : 250)) })
    );
    assert.ok(banded.failures.some((f) => f.includes("over-quantized")));

    const tagged = analyzeStandardAsset("tagged.png", encodePng(600, 580, validCard, { colorType: 6, extraChunks: [["tEXt", Buffer.from("Author\0someone")]] }));
    assert.ok(tagged.failures.some((f) => f.includes("metadata")));

    const interlaced = analyzeStandardAsset("interlaced.png", encodePng(4, 4, () => [0, 0, 0, 0], { colorType: 6, interlaced: true }));
    assert.ok(interlaced.failures.some((f) => f.includes("interlaced")));

    const notPng = analyzeStandardAsset("photo.jpg", Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]));
    assert.ok(notPng.failures.some((f) => f.includes("not a PNG")));
  });

  it("reports a missing file as a FAIL without throwing", () => {
    const report = validateStandardAssetFile(path.join(tmp, "does-not-exist.png"));
    assert.equal(report.verdict, "FAIL");
    assert.deepEqual(report.failures, ["file not found"]);
  });

  // The candidate masters are local, untracked designer files and change over
  // time (the first exports were opaque RGB; the current ones are cut-outs), so
  // this checks the gate's verdict against what each file actually is rather
  // than assuming either. The opaque cases themselves are pinned above by
  // synthetic fixtures.
  it("judges the real candidate masters by what they are, when present locally", (t) => {
    const candidates = ["public/images/standard/archive.png", "public/images/standard/quote.png"].filter((file) => existsSync(file));
    if (candidates.length === 0) return t.skip("candidate masters are not in this checkout");
    for (const file of candidates) {
      const report = validateStandardAssetFile(file);
      const opaqueExport = report.hasAlpha === false || (report.opaqueEdgeRatio ?? 0) >= STANDARD_ASSET_LIMITS.maxOpaqueEdgeRatio;
      assert.equal(report.needsDesignerExport, opaqueExport, file);
      if (opaqueExport) assert.equal(report.verdict, "FAIL", file);
    }
  });
});

describe("assets:validate-standard exit code", () => {
  const quiet = () => {};

  it("exits 0 when every given asset passes", () => {
    const file = writeTmp("ok.png", encodePng(600, 580, validCard, { colorType: 6 }));
    assert.equal(runStandardAssetGate([file], quiet), 0);
  });

  it("exits 1 when any given asset fails, including a missing one", () => {
    const ok = writeTmp("ok2.png", encodePng(600, 580, validCard, { colorType: 6 }));
    const bad = writeTmp("rgb.png", encodePng(600, 600, () => [255, 255, 255], { colorType: 2 }));
    assert.equal(runStandardAssetGate([ok, bad], quiet), 1);
    assert.equal(runStandardAssetGate([path.join(tmp, "missing.png")], quiet), 1);
  });

  it("passes the committed runtime folder", () => {
    assert.equal(runStandardAssetGate([], quiet), 0);
  });
});
