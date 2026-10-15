import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { ensurePdfMeasureFontsLoaded } from "@/features/memories/services/pdfTextMeasure";
import { estimateMemoryCardSize } from "../services/noteCardSatori";
import { layoutWallCards, MAX_SINGLE_CARD_WIDTH, MIN_CARD_WIDTH, wallLayoutMetrics, type WallFormat, type WallLayout } from "./wallLayout";

const SQUARE = wallLayoutMetrics(1080, 1080);
const STORY = wallLayoutMetrics(1080, 1920);
const metricsFor = (format: WallFormat) => (format === "square" ? SQUARE : STORY);
const same = (n: number, aspect = 1) => Array.from({ length: n }, () => aspect);
const near = (a: number, b: number, eps = 0.01) => Math.abs(a - b) <= eps;

function assertOrderedAndUniform(layout: WallLayout) {
  assert.deepEqual(layout.cards.map((c) => c.index), layout.cards.map((_, i) => i), "row-major input order");
  for (const card of layout.cards) assert.ok(near(card.width, layout.cardWidth), "one width for every card");
  for (let i = 1; i < layout.cards.length; i++) {
    const [a, b] = [layout.cards[i - 1], layout.cards[i]];
    assert.ok(b.row > a.row || (b.row === a.row && b.x > a.x), "left to right, then top to bottom");
  }
}

function assertInsideCardArea(layout: WallLayout, format: WallFormat) {
  const m = metricsFor(format);
  for (const card of layout.cards) {
    assert.ok(card.x >= m.padding - 0.01 && card.x + card.width <= m.width - m.padding + 0.01, "inside the side margins");
    assert.ok(card.y >= m.padding + m.headerHeight - 0.01, "below the header");
    assert.ok(card.y + card.height <= m.height - m.padding - m.footerHeight + 0.01, "above the footer");
  }
}

describe("wall layout — square", () => {
  it("1 card: alone, centred, at most 560px wide", () => {
    const layout = layoutWallCards("square", [1], SQUARE);
    assert.equal(layout.columns, 1);
    assert.ok(near(layout.cardWidth, MAX_SINGLE_CARD_WIDTH));
    assert.ok(near(layout.cards[0].x + layout.cardWidth / 2, 540));
  });

  it("2 cards: one row, two columns", () => {
    const layout = layoutWallCards("square", same(2), SQUARE);
    assert.equal(layout.columns, 2);
    assert.deepEqual(layout.rows, [[0, 1]]);
    assert.ok(near(layout.cards[0].y, layout.cards[1].y));
  });

  it("3 cards: 2 + 1, the last one centred", () => {
    const layout = layoutWallCards("square", same(3), SQUARE);
    assert.deepEqual(layout.rows, [[0, 1], [2]]);
    assert.ok(near(layout.cards[2].x + layout.cardWidth / 2, 540), "last card centred");
  });

  it("4 cards: 2 × 2", () => {
    const layout = layoutWallCards("square", same(4), SQUARE);
    assert.deepEqual(layout.rows, [[0, 1], [2, 3]]);
    assert.deepEqual(layout.excluded, []);
  });

  it("never more than 4 cards", () => {
    const layout = layoutWallCards("square", same(7), SQUARE);
    assert.equal(layout.cards.length, 4);
    assert.deepEqual(layout.excluded, [4, 5, 6]);
  });

  for (let n = 1; n <= 4; n++) {
    it(`${n} card(s): in order, one width, inside the card area`, () => {
      const layout = layoutWallCards("square", [0.6, 1.44, 1, 2.1].slice(0, n), SQUARE);
      assertOrderedAndUniform(layout);
      assertInsideCardArea(layout, "square");
    });
  }
});

describe("wall layout — story", () => {
  it("1 card: alone, centred, at most 560px wide", () => {
    const layout = layoutWallCards("story", [1], STORY);
    assert.equal(layout.columns, 1);
    assert.ok(near(layout.cardWidth, MAX_SINGLE_CARD_WIDTH));
    assert.ok(near(layout.cards[0].x + layout.cardWidth / 2, 540));
  });

  for (const n of [2, 3]) {
    it(`${n} cards: one column, stacked`, () => {
      const layout = layoutWallCards("story", same(n), STORY);
      assert.equal(layout.columns, 1);
      assert.deepEqual(layout.rows, same(n).map((_, i) => [i]));
      for (const card of layout.cards) assert.ok(near(card.x + layout.cardWidth / 2, 540), "centred");
      assert.ok(layout.cardWidth <= MAX_SINGLE_CARD_WIDTH + 0.01);
    });
  }

  for (const n of [4, 5, 6, 7, 8]) {
    it(`${n} cards: two columns`, () => {
      const layout = layoutWallCards("story", same(n), STORY);
      assert.equal(layout.columns, 2);
      assert.equal(layout.rows.length, Math.ceil(n / 2));
    });
  }

  it("never more than 8 cards", () => {
    assert.deepEqual(layoutWallCards("story", same(10), STORY).excluded, [8, 9]);
  });

  for (let n = 1; n <= 8; n++) {
    it(`${n} card(s): in order, one width, inside the card area`, () => {
      const layout = layoutWallCards("story", [0.6, 1.44, 1, 2.1, 0.97, 1.5, 1, 1.56].slice(0, n), STORY);
      assertOrderedAndUniform(layout);
      assertInsideCardArea(layout, "story");
    });
  }
});

describe("wall layout — real cards (Alt iş 3A mix)", () => {
  // The same eight cards measured in Alt iş 3A, sized by the real estimator.
  const MIX: Array<[string, string]> = [
    ["classic-yellow", "Bugün denize baktım."],
    ["standard-classic", "Bazı günler sessizdir,\nama içinde koca bir dünya taşır."],
    ["celebration-spark", "Doğum günün kutlu olsun! Nice güzel yaşlara, kahkahalarla dolu yıllara."],
    ["sport-yellow-red", "Şampiyonluk bizim olacak!"],
    ["congratulations-note", "Mezuniyetin kutlu olsun. Emeklerinin karşılığını aldın, seninle gurur duyuyoruz."],
    ["polaroid", "İlk kar.\n\nPencereden izledik, hiç konuşmadan."],
    ["valentines-heart", "Seninle her gün yeni bir başlangıç."],
    [
      "torn-kraft",
      "Bir şehir düşün: sabahları simit kokusu, akşamları martı sesleri. Orada büyüdüm ve her köşesinde bir anım var. Şimdi uzaktayım ama aklımda kalmasın diye yazıyorum.",
    ],
  ];
  let aspects: number[] = [];
  before(async () => {
    await ensurePdfMeasureFontsLoaded();
    aspects = MIX.map(([templateId, content]) => estimateMemoryCardSize(templateId, content, 1000, "modern").height / 1000);
  });

  // Alt iş 3A/3D measured 339px / 292px with a shrink that scaled the gaps
  // too, so those grids ran 7.9px / 33.9px past the card area. Fitting the
  // cards exactly (gaps fixed) gives 335px / 285px — the grid then fills the
  // card area to the pixel.
  it("fits the reference cards exactly: square 4 → 335px, story 8 → 285px (3A's 339/292 overflowed)", () => {
    for (const [format, cards, expected] of [["square", aspects.slice(0, 4), 335], ["story", aspects, 285]] as const) {
      const layout = layoutWallCards(format, [...cards], metricsFor(format));
      assert.equal(Math.round(layout.cardWidth), expected, format);
      const m = metricsFor(format);
      const top = Math.min(...layout.cards.map((c) => c.y));
      const bottom = Math.max(...layout.cards.map((c) => c.y + c.height));
      assert.ok(near(bottom - top, m.height - m.padding * 2 - m.headerHeight - m.footerHeight), `${format} grid fills the card area exactly`);
    }
  });

  it("keeps all of them above the readability floor", () => {
    assert.deepEqual(layoutWallCards("story", aspects, STORY).excluded, []);
    assert.ok(layoutWallCards("story", aspects, STORY).readable);
  });
});

describe("wall layout — readability floor", () => {
  // A long polaroid is the tallest card there is: about 2.1 × its width.
  const LONG_POLAROID = 2.1;

  it("drops cards from the end until the rest are at least 280px wide (story, 8 long polaroids)", () => {
    const layout = layoutWallCards("story", same(8, LONG_POLAROID), STORY);
    assert.deepEqual(layout.excluded, [4, 5, 6, 7]);
    assert.equal(layout.cards.length, 4);
    assert.ok(layout.cardWidth >= MIN_CARD_WIDTH);
    assert.ok(layout.readable);
  });

  it("drops cards from the end on a square too (4 long polaroids → 2)", () => {
    const layout = layoutWallCards("square", same(4, LONG_POLAROID), SQUARE);
    assert.deepEqual(layout.excluded, [2, 3]);
    assert.ok(layout.cardWidth >= MIN_CARD_WIDTH);
  });

  it("keeps the order of the cards it keeps (long CSS card first, short ones after)", () => {
    const layout = layoutWallCards("story", [1.44, 1.44, 1, 1, 1.44, 1.44, 2.1, 2.1], STORY);
    assert.deepEqual(layout.cards.map((c) => c.index), layout.cards.map((_, i) => i));
    assert.deepEqual(layout.excluded, layout.excluded.length ? Array.from({ length: layout.excluded.length }, (_, i) => 8 - layout.excluded.length + i) : []);
    assert.ok(layout.cardWidth >= MIN_CARD_WIDTH);
  });

  it("keeps one card and says it is unreadable when even one can't reach 280px", () => {
    const layout = layoutWallCards("square", [10, 1, 1], SQUARE);
    assert.equal(layout.cards.length, 1);
    assert.equal(layout.cards[0].index, 0);
    assert.deepEqual(layout.excluded, [1, 2]);
    assert.equal(layout.readable, false);
    assert.ok(layout.cardWidth > 0);
  });

  it("lays out nothing for no cards", () => {
    assert.deepEqual(layoutWallCards("story", [], STORY), { cards: [], rows: [], columns: 0, cardWidth: 0, scale: 1, excluded: [], readable: true });
  });

  it("reports the shrink scale", () => {
    assert.equal(layoutWallCards("square", [1], SQUARE).scale, 1);
    const shrunk = layoutWallCards("square", same(4), SQUARE);
    assert.deepEqual(shrunk.excluded, []);
    assert.ok(shrunk.scale < 1 && near(shrunk.cardWidth, 448.2 * shrunk.scale, 0.5));
  });
});
