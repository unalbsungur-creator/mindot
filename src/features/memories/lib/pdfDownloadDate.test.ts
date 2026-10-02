import assert from "node:assert/strict";
import { test } from "node:test";
import { formatPdfDownloadDate } from "./pdfDownloadDate";

test("prints the generation day in Turkish uppercase with Turkish casing", () => {
  assert.equal(formatPdfDownloadDate(new Date("2026-10-15T12:00:00Z"), "tr", "Europe/Istanbul"), "15 EKİM 2026");
  assert.equal(formatPdfDownloadDate(new Date("2026-10-20T12:00:00Z"), "tr", "Europe/Istanbul"), "20 EKİM 2026");
});

test("follows the downloader's time zone across midnight", () => {
  // 22:30 UTC on the 14th is already the 15th in Istanbul (UTC+3).
  const lateNight = new Date("2026-10-14T22:30:00Z");
  assert.equal(formatPdfDownloadDate(lateNight, "tr", "Europe/Istanbul"), "15 EKİM 2026");
  assert.equal(formatPdfDownloadDate(lateNight, "tr", "UTC"), "14 EKİM 2026");
});

test("an invalid time zone falls back instead of throwing", () => {
  assert.match(formatPdfDownloadDate(new Date("2026-10-15T12:00:00Z"), "tr", "Not/AZone"), /^1[45] EKİM 2026$/);
});

test("every locale formats with its own month name", () => {
  const date = new Date("2026-10-15T12:00:00Z");
  assert.equal(formatPdfDownloadDate(date, "en", "UTC"), "OCTOBER 15, 2026");
  assert.equal(formatPdfDownloadDate(date, "de", "UTC"), "15. OKTOBER 2026");
  assert.equal(formatPdfDownloadDate(date, "fr", "UTC"), "15 OCTOBRE 2026");
  assert.equal(formatPdfDownloadDate(date, "es", "UTC"), "15 DE OCTUBRE DE 2026");
});
