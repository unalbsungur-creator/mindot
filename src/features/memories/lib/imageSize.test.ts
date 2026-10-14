import assert from "node:assert/strict";
import { test } from "node:test";
import { readImageSize } from "./imageSize";

function png(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

/** SOI, an APP0 segment, then a SOFn frame header. */
function jpeg(width: number, height: number, sof = 0xc0): Buffer {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x04, 0x00, 0x00]);
  const frame = Buffer.from([0xff, sof, 0x00, 0x0b, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x01, 0x01, 0x11, 0x00]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, frame]);
}

test("reads PNG dimensions from IHDR", () => {
  assert.deepEqual(readImageSize(png(1024, 1536)), { format: "png", width: 1024, height: 1536 });
});

test("reads baseline and progressive JPEG dimensions, skipping earlier segments", () => {
  assert.deepEqual(readImageSize(jpeg(1024, 1536)), { format: "jpg", width: 1024, height: 1536 });
  assert.deepEqual(readImageSize(jpeg(240, 360, 0xc2)), { format: "jpg", width: 240, height: 360 });
});

test("DHT is not mistaken for a frame header", () => {
  const dht = Buffer.from([0xff, 0xc4, 0x00, 0x04, 0x00, 0x00]);
  const buffer = Buffer.concat([Buffer.from([0xff, 0xd8]), dht, jpeg(10, 20).subarray(2)]);
  assert.deepEqual(readImageSize(buffer), { format: "jpg", width: 10, height: 20 });
});

test("anything else is unreadable rather than guessed", () => {
  assert.equal(readImageSize(Buffer.from("RIFF0000WEBP")), null);
  assert.equal(readImageSize(Buffer.alloc(0)), null);
  assert.equal(readImageSize(Buffer.from([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02])), null);
  assert.equal(readImageSize(jpeg(10, 20).subarray(0, 12)), null);
});
