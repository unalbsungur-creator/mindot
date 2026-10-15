import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { ensurePdfMeasureFontsLoaded } from "@/features/memories/services/pdfTextMeasure";
import type { NoteTextFontFamily } from "@/features/notes/types";
import { footballAuthorFontPx, footballTextFitScale } from "./noteCardSatori";

const FONTS: NoteTextFontFamily[] = ["modern", "classic", "handwritten", "typewriter", "serif", "mono", "elegant", "bold"];
const ONE_LINE = "Bugün denize baktım. Dalgalar sakindi. Sonra eve döndüm.";
const TWO_LINES = "Bugün denize baktım.\nSonra eve döndüm.";
const MULTI = "Bugün denize baktım.\nDalgalar sakindi.\n\nSonra eve döndüm.";
const MANY = "Bir\nİki\nÜç\nDört\nBeş\nAltı\nYedi\nSekiz";
const FOURTEEN_LINES = "Bir İki Üç Dört Beş Altı Yedi Sekiz Dokuz On Onbir Oniki Onüç Ondört".split(" ").join("\n");

describe("footballTextFitScale without the measure fonts", () => {
  // Runs first, before `before` below loads them: a share image must never fail on this.
  it("falls back to the unfitted size", () => {
    assert.equal(footballTextFitScale(MANY, "modern", "Test"), 1);
  });
});

describe("footballTextFitScale", () => {
  before(async () => {
    await ensurePdfMeasureFontsLoaded();
  });

  it("leaves a message without a line break exactly as before, at any length", () => {
    for (const fontFamily of FONTS) {
      for (const content of [ONE_LINE, "a ".repeat(45).trim(), "kelime ".repeat(22).trim().slice(0, 150)]) {
        assert.equal(footballTextFitScale(content, fontFamily, "Test"), 1, `${fontFamily}: ${content.length} chars`);
      }
    }
  });

  it("keeps a short two-line message at its tier size", () => {
    for (const fontFamily of FONTS) assert.equal(footballTextFitScale(TWO_LINES, fontFamily, "Test"), 1, fontFamily);
  });

  it("shrinks a message whose many line breaks overflow the disc", () => {
    // The tier is by length alone here (noteTextLengthTier); the line breaks are this fit's job.
    for (const fontFamily of FONTS) {
      const fit = footballTextFitScale(FOURTEEN_LINES, fontFamily, "Test");
      assert.ok(fit < 1, `${fontFamily}: ${fit}`);
      // A fitting size is found well above the 0.4 floor.
      assert.ok(fit > 0.4, `${fontFamily}: ${fit}`);
    }
  });

  it("never grows text, and shrinks it no less as lines are added to the same message", () => {
    const words = ["Bir", "İki", "Üç", "Dört", "Beş", "Altı", "Yedi", "Sekiz", "Dokuz", "On"];
    for (const fontFamily of FONTS) {
      let previous = 1;
      for (let count = 2; count <= words.length; count++) {
        const fit = footballTextFitScale(words.slice(0, count).join("\n"), fontFamily, "Test");
        assert.ok(fit <= previous, `${fontFamily}: ${count} lines → ${fit} > ${previous}`);
        previous = fit;
      }
      assert.ok(footballTextFitScale(MULTI, fontFamily, "Test") <= 1, fontFamily);
    }
  });

  it("fits a 79-character, four-break message without shrinking it more than its lines need", () => {
    const content = "Bugün maç vardı.\nÇok heyecanlıydı.\n\nSonunda kazandık!\nHep birlikte de sevindik.";
    assert.equal(content.length, 79);
    assert.equal(content.split("\n").length - 1, 4);
    for (const fontFamily of FONTS) {
      const fit = footballTextFitScale(content, fontFamily, "Ayşe Yılmaz");
      // Before this fix the line breaks also pushed it to the dense tier (0.5 instead of 0.82): together ≈ 0.4–0.5 of the length-tier size.
      assert.ok(fit >= 0.7 && fit <= 1, `${fontFamily}: ${fit}`);
    }
  });

  it("keeps the author line at 10.5px without line breaks, and never larger than the message with them", () => {
    assert.equal(footballAuthorFontPx(ONE_LINE, 12.46, 1), 10.5);
    assert.equal(footballAuthorFontPx("a".repeat(140), 7.6, 1), 10.5, "a long one-line message keeps its old author size");
    for (const fontFamily of FONTS) {
      for (const content of [TWO_LINES, MULTI, MANY, FOURTEEN_LINES]) {
        const fit = footballTextFitScale(content, fontFamily, "Ayşe Yılmaz");
        for (const textPx of [12.46 * fit, 9.73 * fit, 7.6 * fit]) {
          const author = footballAuthorFontPx(content, textPx, fit);
          assert.ok(author <= textPx + 1e-9, `${fontFamily}: author ${author} > text ${textPx}`);
          assert.ok(author <= 10.5 * fit + 1e-9, `${fontFamily}: author shrinks with the fit`);
        }
      }
    }
  });

  it("leaves more room without an author line", () => {
    for (const fontFamily of FONTS) {
      assert.ok(footballTextFitScale(FOURTEEN_LINES, fontFamily, null) >= footballTextFitScale(FOURTEEN_LINES, fontFamily, "Test"), fontFamily);
    }
  });
});
