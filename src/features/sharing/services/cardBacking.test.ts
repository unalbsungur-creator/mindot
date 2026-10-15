import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decodePng } from "@/lib/assets/png";
import { getFrameTemplate } from "@/features/memories/config/frameTemplates";
import { PDF_COLORS } from "@/features/memories/services/pdfPalette";
import { ensurePdfMeasureFontsLoaded } from "@/features/memories/services/pdfTextMeasure";
import { noteTemplates } from "@/features/notes/config/templates";
import type { NoteTemplate } from "@/features/notes/types";
import { cardBackingFor, cardBackingStyle } from "./cardBacking";
import { isImageBacked } from "./noteCardSatori";
import { renderShareCard } from "./shareCardRenderer";

// The canvas-tone backing under a see-through-centre card — measured on the
// real artwork, shared by the PDF V2 card image and the framed share image.

describe("cardBackingFor", () => {
  it("backs exactly the two see-through Special Day cards, as a whole card", async () => {
    const backed: Record<string, string> = {};
    for (const template of noteTemplates) {
      const backing = await cardBackingFor(template);
      if (backing) backed[template.id] = backing;
    }
    assert.deepEqual(backed, { "celebration-spark": "card", "congratulations-note": "card" });
  });

  it("never backs a card that isn't image-backed", async () => {
    const plain = noteTemplates.filter((template) => !isImageBacked(template));
    assert.ok(plain.length > 0);
    for (const template of plain) assert.equal(await cardBackingFor(template), null, template.id);
  });

  it("measures each template once and reuses the answer", () => {
    const template = noteTemplates.find((t) => t.id === "celebration-spark")!;
    assert.equal(cardBackingFor(template), cardBackingFor(template));
  });

  it("forgets a failed measurement so the next call tries again", async () => {
    const missing = {
      ...noteTemplates.find((t) => t.id === "celebration-spark")!,
      id: "test-missing-artwork",
      image: "/images/postits/does-not-exist.png",
    } as NoteTemplate;
    const first = cardBackingFor(missing);
    await assert.rejects(first);
    await new Promise((resolve) => setImmediate(resolve));
    const second = cardBackingFor(missing);
    assert.notEqual(second, first);
    await assert.rejects(second);
  });

  it("draws the backing in the board's canvas tone, inside the card", () => {
    const template = noteTemplates.find((t) => t.id === "celebration-spark")!;
    const style = cardBackingStyle("card", template, 400, 400);
    assert.equal(style.background, PDF_COLORS.canvas);
    assert.equal(style.position, "absolute");
    assert.ok((style.left as number) > 0 && (style.width as number) < 400);
  });
});

describe("framed share image", () => {
  // Down the centre column, inside the card, a see-through card used to show the frame's own colour.
  async function frameColouredRowsInCentreColumn(templateId: string, frameId: string): Promise<number> {
    await ensurePdfMeasureFontsLoaded();
    const frame = getFrameTemplate(frameId)!;
    const format = { id: "print", name: "Print", width: 480, height: 600 };
    const image = await renderShareCard({
      primary: { content: "Mezuniyetin kutlu olsun.", templateId, fontFamily: "modern", authorName: null },
      format,
      frame,
    });
    const png = decodePng(Buffer.from(await image.arrayBuffer()));
    const frameRgb = [1, 3, 5].map((i) => parseInt(frame.background.slice(i, i + 2), 16));
    const x = format.width / 2;
    let rows = 0;
    for (let y = Math.round(format.height * 0.3); y < format.height * 0.6; y++) {
      const i = (y * png.header.width + x) * 4;
      if ([0, 1, 2].every((c) => Math.abs(png.rgba[i + c] - frameRgb[c]) <= 6)) rows++;
    }
    return rows;
  }

  it("puts the canvas tone, not a dark frame, behind a see-through card's text", async () => {
    for (const frameId of ["minimal-navy", "premium-edition"]) {
      for (const templateId of ["celebration-spark", "congratulations-note"]) {
        assert.equal(await frameColouredRowsInCentreColumn(templateId, frameId), 0, `${frameId} / ${templateId}`);
      }
    }
  });

  it("keeps a light or orange frame's own colour behind a see-through card (no backing)", async () => {
    for (const frameId of ["gallery-white", "classic-paper", "memory-orange"]) {
      for (const templateId of ["celebration-spark", "congratulations-note"]) {
        assert.ok((await frameColouredRowsInCentreColumn(templateId, frameId)) > 0, `${frameId} / ${templateId}`);
      }
    }
  });
});
