import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LINE_BREAK_WEIGHT, noteTextLengthTier, noteTextSizeTier, STANDARD_LINE_BREAK_WEIGHT, type NoteTextSizeTier } from "./textScale";

// The card's message size itself is the card-text fit (cardText.test.ts); these tiers remain for a
// growing card's size and the board footprint.
const TIERS: NoteTextSizeTier[] = ["xlarge", "large", "default", "compact", "dense"];
const tierRank = (content: string) => TIERS.indexOf(noteTextSizeTier(content));
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

describe("length tier vs. line-aware tier", () => {
  it("noteTextLengthTier ignores line breaks", () => {
    assert.equal(noteTextLengthTier("Bir\nİki\nÜç"), noteTextSizeTier("Bir İki Üç", 0));
    assert.equal(noteTextLengthTier(lines(8)), noteTextSizeTier(lines(8).replace(/\n/g, " "), 0));
  });

  it("weighs a break as a full line on the default weight and half a line on the growing card (its size tier and the board footprint)", () => {
    const content = "Bugün denize baktım.\nDalgalar sakindi.\n\nSonra eve döndüm..."; // 59 chars, 3 breaks
    assert.equal(content.length, 59);
    assert.equal(LINE_BREAK_WEIGHT, 18);
    assert.equal(STANDARD_LINE_BREAK_WEIGHT, 9);
    assert.equal(noteTextSizeTier(content, STANDARD_LINE_BREAK_WEIGHT), "default"); // 59 + 27
    assert.equal(noteTextSizeTier(content), "compact"); // 59 + 54
  });
});
