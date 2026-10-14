import assert from "node:assert/strict";
import { test } from "node:test";
import { pdfBackgrounds } from "../config/pdfBackgrounds";
import { memoryPdfUrl } from "./memoryPdfUrl";

test("View PDF and the download button ask for the same chosen design", () => {
  for (const background of pdfBackgrounds) {
    assert.equal(memoryPdfUrl("p1", { backgroundId: background.id, inline: true }), `/api/memories/p1/download?disposition=inline&background=${background.id}`);
    assert.equal(memoryPdfUrl("p1", { backgroundId: background.id }), `/api/memories/p1/download?background=${background.id}`);
  }
});

test("no design → no ?background=, so the route uses the default", () => {
  assert.equal(memoryPdfUrl("p1"), "/api/memories/p1/download");
  assert.equal(memoryPdfUrl("p1", { backgroundId: null, inline: true }), "/api/memories/p1/download?disposition=inline");
  assert.equal(memoryPdfUrl("p1", { backgroundId: "" }), "/api/memories/p1/download");
});

test("the design id is encoded", () => {
  assert.equal(memoryPdfUrl("p1", { backgroundId: "a&b=c" }), "/api/memories/p1/download?background=a%26b%3Dc");
});
