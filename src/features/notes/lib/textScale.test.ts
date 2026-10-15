import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { ensurePdfMeasureFontsLoaded, wrapTextToLines } from "@/features/memories/services/pdfTextMeasure";
import { spaciousTextSizePx } from "@/features/sharing/services/noteCardSatori";
import { getNoteTemplate, noteTemplates } from "../config/templates";
import type { NoteTextFontFamily } from "../types";
import {
  LINE_BREAK_WEIGHT,
  noteTextLengthTier,
  noteTextScaleClass,
  noteTextSizeTier,
  STANDARD_LINE_BREAK_WEIGHT,
  spaciousLineHeight,
  spaciousTextFit,
  spaciousTextSizeCqw,
  SPACIOUS_TEXT_SIZE_CQW,
  type NoteTextSizeTier,
} from "./textScale";

const FONTS: NoteTextFontFamily[] = ["modern", "classic", "handwritten", "typewriter", "serif", "mono", "elegant", "bold"];
const TIERS: NoteTextSizeTier[] = ["xlarge", "large", "default", "compact", "dense"];
const tierRank = (content: string) => TIERS.indexOf(noteTextSizeTier(content));
const SPACIOUS = noteTemplates.filter((t) => t.contentTextSize === "spacious");
const lines = (count: number, word = "Satır") => Array.from({ length: count }, (_, i) => `${word} ${i + 1}`).join("\n");

describe("noteTextSizeTier", () => {
  it("tiers text without a line break by length: ≤30 xlarge, ≤60 large, ≤90 default, ≤130 compact, longer dense", () => {
    const expected: Array<[number, NoteTextSizeTier]> = [
      [1, "xlarge"], [30, "xlarge"], [31, "large"], [60, "large"], [61, "default"],
      [90, "default"], [91, "compact"], [130, "compact"], [131, "dense"], [150, "dense"],
    ];
    for (const [length, tier] of expected) assert.equal(noteTextSizeTier("a".repeat(length)), tier, `${length} chars`);
  });

  it("keeps the old 90/130 boundaries for text without a line break", () => {
    assert.equal(noteTextSizeTier("a".repeat(90)), "default");
    assert.equal(noteTextSizeTier("a".repeat(91)), "compact");
    assert.equal(noteTextSizeTier("a".repeat(131)), "dense");
  });

  it("never gives text with line breaks a larger tier than the same characters on one line", () => {
    const samples = ["Bir\nİki", "Bugün denize baktım.\nSonra eve döndüm.", lines(3), lines(6), `${"a".repeat(70)}\n${"b".repeat(50)}`];
    for (const multi of samples) {
      const single = multi.replace(/\n/g, " ");
      assert.equal(single.length, multi.length);
      assert.ok(tierRank(multi) >= tierRank(single), JSON.stringify(multi));
    }
    // And strictly smaller here: 50 characters on one line vs. the same 50 on five lines.
    assert.equal(noteTextSizeTier("a".repeat(50)), "large");
    assert.equal(noteTextSizeTier(["a".repeat(10), "b".repeat(9), "c".repeat(9), "d".repeat(9), "e".repeat(9)].join("\n")), "compact");
  });

  it("weighs each line break like a line of text, so a few short lines leave the largest tier", () => {
    assert.equal(noteTextSizeTier("Bir\nİki"), "xlarge");
    assert.equal(noteTextSizeTier("Bir\nİki\nÜç"), "large");
    assert.equal(noteTextSizeTier(lines(8)), "dense");
  });

  it("never grows as lines are added", () => {
    let previous = 0;
    for (let count = 1; count <= 15; count++) {
      const rank = tierRank(lines(count, "a"));
      assert.ok(rank >= previous, `${count} lines`);
      previous = rank;
    }
  });
});

describe("spacious (Standard card) sizes", () => {
  it("keeps the measured default/compact/dense sizes unchanged", () => {
    const measured: Record<NoteTextFontFamily, [number, number, number]> = {
      modern: [7.1, 5.7, 5.5], classic: [6.9, 5.5, 5.3], handwritten: [8.0, 6.9, 6.4], typewriter: [6.6, 5.55, 5.5],
      serif: [6.7, 5.35, 5.1], mono: [6.6, 5.55, 5.5], elegant: [6.3, 5, 4.9], bold: [6.7, 5.35, 5.2],
    };
    for (const font of FONTS) {
      const { default: d, compact, dense } = SPACIOUS_TEXT_SIZE_CQW[font];
      assert.deepEqual([d, compact, dense], measured[font], font);
    }
  });

  it("sizes the short tiers up from the measured default: large ×1.1, xlarge ×1.45", () => {
    for (const font of FONTS) {
      const t = SPACIOUS_TEXT_SIZE_CQW[font];
      assert.ok(Math.abs(t.large - t.default * 1.1) < 0.01, `${font} large`);
      assert.ok(Math.abs(t.xlarge - t.default * 1.45) < 0.01, `${font} xlarge`);
    }
  });

  it("never gets larger from one tier to the next", () => {
    for (const font of FONTS) {
      const sizes = TIERS.map((tier) => SPACIOUS_TEXT_SIZE_CQW[font][tier]);
      for (let i = 1; i < sizes.length; i++) assert.ok(sizes[i] <= sizes[i - 1], `${font} ${TIERS[i]}`);
    }
  });

  it("the share card / PDF px size is exactly cqw × 176 / 100 of the DOM size, for every font, tier and card", () => {
    const samples = ["Kısa", "a".repeat(45), "a".repeat(80), "a".repeat(120), "a".repeat(150), lines(4), lines(12)];
    for (const template of SPACIOUS) {
      for (const font of FONTS) {
        for (const content of samples) {
          const cqw = spaciousTextSizeCqw(content, font, template);
          assert.ok(Math.abs(spaciousTextSizePx(content, font, template) - (cqw * 176) / 100) < 1e-9, `${template.id} ${font}`);
        }
      }
    }
  });

  it("matches the old fixed px table at the measured tiers (cqw × 1.76)", () => {
    const classic = getNoteTemplate("standard-classic");
    // The pre-3B SPACIOUS_IMAGE_BACKED_FONT_PX "modern" row: 12.5 / 10.03 / 9.68.
    assert.ok(Math.abs(spaciousTextSizePx("a".repeat(80), "modern", classic) - 12.5) < 0.01);
    assert.ok(Math.abs(spaciousTextSizePx("a".repeat(120), "modern", classic) - 10.03) < 0.01);
    assert.ok(Math.abs(spaciousTextSizePx("a".repeat(150), "modern", classic) - 9.68) < 0.01);
  });

  it("puts only the leading in the class — the size is set inline", () => {
    assert.equal(noteTextScaleClass("Merhaba", "modern", "imageBackedSpacious"), "leading-snug");
    assert.equal(noteTextScaleClass("Merhaba", "handwritten", "imageBackedSpacious"), "leading-tight");
    assert.equal(spaciousLineHeight("handwritten"), 1.25);
    assert.equal(spaciousLineHeight("modern"), 1.375);
  });
});

describe("spaciousTextFit", () => {
  it("is exactly 1 for text without a line break, at any length", () => {
    for (const template of SPACIOUS) {
      for (const font of FONTS) {
        for (const length of [5, 30, 60, 90, 150]) assert.equal(spaciousTextFit("a".repeat(length), font, template), 1);
      }
    }
  });

  it("keeps a few short lines at full tier size", () => {
    for (const template of SPACIOUS) {
      for (const font of FONTS) assert.equal(spaciousTextFit("Bugün denize baktım.\nSonra eve döndüm.", font, template), 1, `${template.id} ${font}`);
    }
  });

  it("shrinks many lines so they and the author line fit the card's own text box", () => {
    for (const template of SPACIOUS) {
      const area = template.contentArea!;
      const boxHeight = (parseFloat(area.height) * template.imageHeight!) / template.imageWidth!;
      for (const font of FONTS) {
        const content = lines(14, "a");
        const size = spaciousTextSizeCqw(content, font, template);
        assert.ok(spaciousTextFit(content, font, template) < 1, `${template.id} ${font}`);
        const lh = spaciousLineHeight(font);
        const height = 14 * size * lh + size * 0.5 + size * 0.85 * lh;
        assert.ok(height <= boxHeight, `${template.id} ${font}: ${height.toFixed(1)} > ${boxHeight.toFixed(1)}`);
      }
    }
  });

  it("never grows the size as lines are added to the same message", () => {
    const words = "Bir İki Üç Dört Beş Altı Yedi Sekiz Dokuz On Onbir Oniki Onüç Ondört Onbeş".split(" ");
    for (const template of SPACIOUS) {
      for (const font of FONTS) {
        let previous = Infinity;
        for (let count = 1; count <= words.length; count++) {
          const size = spaciousTextSizeCqw(words.slice(0, count).join("\n"), font, template);
          assert.ok(size <= previous + 1e-9, `${template.id} ${font} ${count} lines`);
          previous = size;
        }
      }
    }
  });
});

describe("length tier vs. line-aware tier", () => {
  it("noteTextLengthTier ignores line breaks", () => {
    assert.equal(noteTextLengthTier("Bir\nİki\nÜç"), noteTextSizeTier("Bir İki Üç", 0));
    assert.equal(noteTextLengthTier(lines(8)), noteTextSizeTier(lines(8).replace(/\n/g, " "), 0));
  });

  it("weighs a break as a full line on fixed DOM boxes and half a line on the growing standard card", () => {
    const content = "Bugün denize baktım.\nDalgalar sakindi.\n\nSonra eve döndüm..."; // 59 chars, 3 breaks
    assert.equal(content.length, 59);
    assert.equal(LINE_BREAK_WEIGHT, 18);
    assert.equal(STANDARD_LINE_BREAK_WEIGHT, 9);
    assert.equal(noteTextSizeTier(content, STANDARD_LINE_BREAK_WEIGHT), "default"); // 59 + 27
    assert.equal(noteTextSizeTier(content), "compact"); // 59 + 54
    assert.equal(noteTextScaleClass(content, "modern", "standard"), noteTextScaleClass("a".repeat(80), "modern", "standard"));
    assert.equal(noteTextScaleClass(content, "modern", "football"), noteTextScaleClass("a".repeat(120), "modern", "football"));
  });
});

describe("Standard cards with line breaks", () => {
  const STD_59 = "Bugün denize baktım.\nDalgalar sakindi.\n\nSonra eve döndüm...";
  const STD_79 = "Bugün denize baktım.\nDalgalar sakindi.\n\nSonra eve döndüm ve uzun uzun düşündüm.";

  it("keep a 59-character, three-break message within 10% of its length tier's size on every card and font", () => {
    // Before this fix it dropped to the compact tier (−20%) and was then fitted again.
    assert.equal(STD_59.split("\n").length - 1, 3);
    for (const template of SPACIOUS) {
      for (const font of FONTS) {
        const full = SPACIOUS_TEXT_SIZE_CQW[font][noteTextLengthTier(STD_59)];
        const size = spaciousTextSizeCqw(STD_59, font, template);
        assert.ok(size >= full * 0.9 && size <= full, `${template.id} ${font}: ${size} vs ${full}`);
      }
    }
  });

  it("keep the 79-character, three-break message from the 3B review at the size it had on one line", () => {
    const classic = getNoteTemplate("standard-classic");
    assert.equal(spaciousTextSizeCqw(STD_79, "modern", classic), spaciousTextSizeCqw(STD_79.replace(/\n+/g, " "), "modern", classic));
  });

  it("size short, medium and multi-line messages from large to small", () => {
    const classic = getNoteTemplate("standard-classic");
    const short = spaciousTextSizeCqw("Merhaba!", "modern", classic);
    const medium = spaciousTextSizeCqw("a".repeat(75), "modern", classic);
    const multi = spaciousTextSizeCqw(lines(12), "modern", classic);
    assert.ok(short > medium && medium > multi, `${short} > ${medium} > ${multi}`);
  });
});

describe("Standard card fit, measured with the real fonts", () => {
  const CORPUS = [
    "Bugün denize baktım.\nDalgalar sakindi.\n\nSonra eve döndüm...",
    "İyi ki doğdun!\nNice mutlu yıllara.\n\nSeni çok seviyoruz,\nhep yanındayız.",
    "BUGÜN DENİZE BAKTIM.\nDALGALAR SAKİNDİ.\n\nSONRA EVE DÖNDÜM.",
    "Liebe Grüße aus München!\nVerantwortungsbewusstsein ist wichtig.\nBis bald.",
    "Bugün sahilde uzun bir yürüyüş yaptım.\nRüzgâr serin, deniz sakindi.\n\nAklımda hep aynı soru vardı:\nYarın ne getirecek?",
    lines(8),
    lines(14, "a"),
  ];

  before(async () => {
    await ensurePdfMeasureFontsLoaded();
  });

  it("never lets the text and the author line overflow the card's text box", () => {
    for (const template of SPACIOUS) {
      const area = template.contentArea!;
      const boxWidth = parseFloat(area.width);
      const boxHeight = (parseFloat(area.height) * template.imageHeight!) / template.imageWidth!;
      for (const font of FONTS) {
        const lh = spaciousLineHeight(font);
        for (const content of CORPUS) {
          const size = spaciousTextSizeCqw(content, font, template);
          const rows = wrapTextToLines(content, font, size, boxWidth).length;
          const height = rows * size * lh + size * 0.5 + size * 0.85 * lh;
          assert.ok(height <= boxHeight, `${template.id} ${font} ${JSON.stringify(content.slice(0, 20))}: ${height.toFixed(1)} > ${boxHeight.toFixed(1)}`);
        }
      }
    }
  });
});

describe("cards outside the Standard set", () => {
  it("keep their 'default' size for the two short tiers", () => {
    for (const context of ["standard", "football", "imageBacked"] as const) {
      for (const font of FONTS) {
        const def = noteTextScaleClass("a".repeat(80), font, context);
        assert.equal(noteTextScaleClass("a".repeat(10), font, context), def, `${context} ${font} xlarge`);
        assert.equal(noteTextScaleClass("a".repeat(45), font, context), def, `${context} ${font} large`);
      }
    }
  });
});
