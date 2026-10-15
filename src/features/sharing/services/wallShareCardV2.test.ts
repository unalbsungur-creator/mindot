import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { decodePng, type DecodedPng } from "@/lib/assets/png";
import { ensurePdfMeasureFontsLoaded } from "@/features/memories/services/pdfTextMeasure";
import { getNoteTemplate } from "@/features/notes/config/templates";
import { getShareFormat } from "../config/shareFormats";
import { layoutWallCards, wallLayoutMetrics } from "../lib/wallLayout";
import { estimateMemoryCardSize } from "./noteCardSatori";
import { renderWallShareCardV2, type WallShareCardV2Note } from "./shareCardRenderer";

// The wall share image drawn with the real cards, checked on the PNG
// itself: located with the same layout the renderer uses.

const NOTES: WallShareCardV2Note[] = [
  { templateId: "classic-yellow", content: "Bugün denize baktım.", fontFamily: "modern" },
  { templateId: "celebration-spark", content: "Doğum günün kutlu olsun! Nice güzel yaşlara.", fontFamily: "modern" },
  { templateId: "polaroid", content: "İlk kar.\n\nPencereden izledik, hiç konuşmadan.", fontFamily: "modern", textAlign: "left" },
  { templateId: "congratulations-note", content: "Mezuniyetin kutlu olsun.", fontFamily: "modern" },
];
// A square holds 4 cards at >= 280px only if the rows are short enough: a short polaroid.
const SQUARE_NOTES: WallShareCardV2Note[] = NOTES.map((n) => (n.templateId === "polaroid" ? { ...n, content: "İlk kar." } : n));
const notesFor = (formatId: "square" | "story") => (formatId === "square" ? SQUARE_NOTES : NOTES);

const rgb = (png: DecodedPng, x: number, y: number) => {
  const i = (Math.round(y) * png.header.width + Math.round(x)) * 4;
  return [png.rgba[i], png.rgba[i + 1], png.rgba[i + 2]];
};
const near = (a: number[], b: number[], d = 4) => a.every((v, i) => Math.abs(v - b[i]) <= d);

async function render(formatId: "square" | "story", notes = notesFor(formatId)) {
  const format = getShareFormat(formatId);
  const image = await renderWallShareCardV2({ displayName: "Ayşe", notes, format, slogan: "Aklında kalmasın." });
  const png = decodePng(Buffer.from(await image.arrayBuffer()));
  const aspects = notes.map((n) => estimateMemoryCardSize(n.templateId, n.content, 1000, n.fontFamily).height / 1000);
  return { png, layout: layoutWallCards(formatId, aspects, wallLayoutMetrics(format.width, format.height)) };
}

describe("renderWallShareCardV2", () => {
  before(async () => {
    await ensurePdfMeasureFontsLoaded();
  });

  for (const formatId of ["square", "story"] as const) {
    it(`${formatId}: keeps the format's size and draws each Special Day card on the canvas backing`, async () => {
      const { png, layout } = await render(formatId);
      const format = getShareFormat(formatId);
      assert.deepEqual([png.header.width, png.header.height], [format.width, format.height]);
      assert.equal(layout.cards.length, 4);
      for (const placed of layout.cards) {
        const template = getNoteTemplate(notesFor(formatId)[placed.index].templateId);
        if (!template.id.startsWith("celebration") && !template.id.startsWith("congratulations")) continue;
        const area = template.contentArea!;
        const x = placed.x + ((parseFloat(area.left) + parseFloat(area.width) / 2) / 100) * placed.width;
        const y = placed.y + ((parseFloat(area.top) + parseFloat(area.height) / 2) / 100) * placed.height;
        // The navy page would show here without the backing; #f3efe4 is the board's canvas.
        assert.ok(near(rgb(png, x, y), [243, 239, 228]), `${template.id} centre ${rgb(png, x, y)}`);
      }
    });

    it(`${formatId}: the polaroid's grey strip reaches the card's right edge`, async () => {
      const { png, layout } = await render(formatId);
      const placed = layout.cards.find((c) => notesFor(formatId)[c.index].templateId === "polaroid")!;
      const y = placed.y + (30 / 176) * placed.width;
      let last = -1;
      for (let x = Math.floor(placed.x); x <= Math.ceil(placed.x + placed.width); x++) if (near(rgb(png, x, y), [231, 230, 229])) last = x;
      assert.ok(Math.abs(placed.x + placed.width - 1 - last) <= 1, `strip ends at ${last}, card at ${placed.x + placed.width}`);
    });
  }

  it("draws nothing on the page outside the laid-out cards' area but the navy page, header and footer", async () => {
    const { png, layout } = await render("square", NOTES.slice(0, 1));
    const card = layout.cards[0];
    // Left of the lone, centred card, at its middle height: plain navy page.
    assert.ok(near(rgb(png, card.x / 2, card.y + card.height / 2), [13, 27, 42]));
  });

  it("square: drops cards from the end rather than draw them under 280px (long polaroid → 2 cards)", async () => {
    const { png, layout } = await render("square", NOTES);
    assert.deepEqual(layout.excluded, [2, 3]);
    assert.ok(layout.cardWidth >= 280);
    assert.deepEqual([png.header.width, png.header.height], [1080, 1080]);
  });

  it("refuses formats other than square and story", async () => {
    await assert.rejects(renderWallShareCardV2({ displayName: "Ayşe", notes: NOTES, format: getShareFormat("print") }));
  });
});
