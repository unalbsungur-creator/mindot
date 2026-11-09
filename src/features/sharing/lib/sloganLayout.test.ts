import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { ensurePdfMeasureFontsLoaded, sloganMeasure } from "@/features/memories/services/pdfTextMeasure";
import { pdfBackgrounds } from "@/features/memories/config/pdfBackgrounds";
import { layoutPdfSlogan } from "@/features/memories/services/pdfSlogan";
import { PDF_SLOGAN_FONT_SIZE_PT, pdfSloganMaxWidth } from "@/features/memories/lib/pdfDownloadLayout";
import { locales } from "@/i18n/config";
import { getDictionary } from "@/i18n/translations";
import { balancedSloganSplit, layoutSlogan, SLOGAN_MIN_SCALE, sloganScales } from "./sloganLayout";

/** 10 units per character at size 10 — easy widths to reason about. */
const monospace = (text: string, fontSize: number) => text.length * fontSize;
const lineText = (line: { head: string; tail: string }) => [line.head, line.tail].filter(Boolean).join(" ");

describe("layoutSlogan", () => {
  it("tries the design size first, then steps down by 5% to at most 20% smaller", () => {
    assert.deepEqual(sloganScales(), [1, 0.95, 0.9, 0.85, 0.8]);
    assert.equal(SLOGAN_MIN_SCALE, 0.8);
  });

  it("keeps a slogan that fits on one line at the design size", () => {
    const layout = layoutSlogan("AKLINDA KALMASIN.", { fontSize: 10, maxWidth: 200, measure: monospace });
    assert.equal(layout.fontSize, 10);
    assert.deepEqual(layout.lines, [{ head: "AKLINDA", tail: "KALMASIN." }]);
    assert.equal(layout.fits, true);
  });

  it("shrinks step by step before breaking the line", () => {
    // 17 characters: 170 at size 10, 153 at 9 — the first step that fits 155 is 0.9.
    const layout = layoutSlogan("AKLINDA KALMASIN.", { fontSize: 10, maxWidth: 155, measure: monospace });
    assert.equal(layout.lines.length, 1);
    assert.ok(Math.abs(layout.fontSize - 9) < 1e-9);
  });

  it("never shrinks past 80% on one line — it breaks into two balanced lines instead", () => {
    // 25 characters: 200 at 80%, so 190 can't hold one line.
    const layout = layoutSlogan("NE LE GARDE PAS POUR TOI.", { fontSize: 10, maxWidth: 190, measure: monospace });
    assert.deepEqual(layout.lines.map(lineText), ["NE LE GARDE", "PAS POUR TOI."]);
    assert.equal(layout.fontSize, 10, "two lines start again from the design size");
    assert.equal(layout.fits, true);
  });

  it("keeps the last word as the orange tail of the last line", () => {
    const layout = layoutSlogan("NE LE GARDE PAS POUR TOI.", { fontSize: 10, maxWidth: 190, measure: monospace });
    assert.deepEqual(layout.lines, [
      { head: "NE LE GARDE", tail: "" },
      { head: "PAS POUR", tail: "TOI." },
    ]);
  });

  it("never leaves one word alone on the bottom line of a slogan with three or more words", () => {
    // Narrowest-max split of "AAAAAAAAAA B C" would put "C" alone — not allowed.
    const split = balancedSloganSplit(["AAAAAAAAAAAA", "BB", "C"], (text) => text.length);
    assert.deepEqual(split, [["AAAAAAAAAAAA"], ["BB", "C"]]);
    for (const slogan of ["A B C", "ONE TWO THREE FOUR", "LASS ES NICHT UNGESAGT."]) {
      const words = slogan.split(" ");
      const [, bottom] = balancedSloganSplit(words, (text) => text.length)!;
      assert.ok(bottom.length >= 2, slogan);
    }
  });

  it("shrinks two lines too when the balanced split is still too wide, and reports a slogan that can't fit", () => {
    const shrunk = layoutSlogan("NE LE GARDE PAS POUR TOI.", { fontSize: 10, maxWidth: 120, measure: monospace });
    assert.equal(shrunk.lines.length, 2);
    assert.ok(Math.abs(shrunk.fontSize - 9) < 1e-9);
    const impossible = layoutSlogan("NE LE GARDE PAS POUR TOI.", { fontSize: 10, maxWidth: 50, measure: monospace });
    assert.equal(impossible.fits, false);
    assert.ok(Math.abs(impossible.fontSize - 8) < 1e-9);
  });

  it("draws a single word on one line, shrunk at most 20%", () => {
    const layout = layoutSlogan("MINDOT", { fontSize: 10, maxWidth: 10, measure: monospace });
    assert.deepEqual(layout.lines, [{ head: "", tail: "MINDOT" }]);
    assert.equal(layout.fits, false);
  });
});

describe("the real slogans on every PDF design (Noto Sans Bold metrics)", () => {
  before(() => ensurePdfMeasureFontsLoaded());

  for (const locale of locales) {
    const slogan = getDictionary(locale).boardPage.slogan;
    it(`${locale}: "${slogan}" fits every design — one centred line where possible, otherwise two balanced ones`, () => {
      const measure = sloganMeasure("bold", 4.2 / 17);
      for (const design of pdfBackgrounds) {
        const layout = layoutPdfSlogan(design, slogan);
        assert.ok(layout.fits, `${design.id}: does not fit`);
        assert.ok(layout.fontSize >= PDF_SLOGAN_FONT_SIZE_PT * SLOGAN_MIN_SCALE - 1e-9, `${design.id}: shrunk past 20%`);
        for (const line of layout.lines) {
          assert.ok(measure(lineText(line), layout.fontSize) <= pdfSloganMaxWidth(design), `${design.id}: "${lineText(line)}" too wide`);
        }
        assert.equal(layout.lines.map(lineText).join(" "), slogan, `${design.id}: words lost or reordered`);
        assert.equal(layout.lines.at(-1)!.tail, slogan.split(" ").at(-1), `${design.id}: last word not the accent`);
        if (layout.lines.length === 2) assert.ok(layout.lines[1].head !== "", `${design.id}: a lone word on the bottom line`);
      }
    });
  }

  it("Turkish, English and Spanish stay on one line on every design", () => {
    for (const locale of ["tr", "en", "es"] as const) {
      for (const design of pdfBackgrounds) assert.equal(layoutPdfSlogan(design, getDictionary(locale).boardPage.slogan).lines.length, 1, `${locale} ${design.id}`);
    }
  });
});
