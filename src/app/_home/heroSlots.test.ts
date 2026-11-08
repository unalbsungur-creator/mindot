import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { estimateNoteFootprint } from "@/features/notes/lib/footprint";
import type { NoteData } from "@/features/notes/types";
import { arrangeHeroSlots } from "./heroSlots";

const note = (id: string, templateId: string, content: string): NoteData => ({
  id,
  content,
  authorName: "a",
  templateId,
  size: "sm",
  rotation: 0,
  position: { top: "0%", left: "0%" },
});
const height = (n: NoteData) => estimateNoteFootprint(n.templateId, n.content).height;

describe("arrangeHeroSlots", () => {
  const long = "Todo pensamiento merece un lugar en el muro, y cada palabra encuentra su sitio en algún rincón de esta pared.";
  const notes = [
    note("short-a", "classic-yellow", "Kısa."),
    note("tall-polaroid", "polaroid", long),
    note("short-b", "classic-yellow", "Kısa iki."),
    note("tall-text", "warm-cream", long),
  ];

  it("never puts the two tallest cards in the same column", () => {
    const [topLeft, topRight, bottomLeft, bottomRight] = arrangeHeroSlots(notes);
    const tallest = [...notes].sort((a, b) => height(b) - height(a)).slice(0, 2).map((n) => n.id);
    assert.ok(tallest.includes(bottomLeft.id) && tallest.includes(bottomRight.id), "the two tallest go to the bottom slots, one per column");
    assert.ok(!tallest.includes(topLeft.id) && !tallest.includes(topRight.id));
  });

  it("keeps every card, each once, and is deterministic", () => {
    const arranged = arrangeHeroSlots(notes);
    assert.deepEqual(arranged.map((n) => n.id).sort(), notes.map((n) => n.id).sort());
    assert.deepEqual(arrangeHeroSlots(notes), arranged);
  });

  it("leaves fewer than 4 cards in their own order", () => {
    assert.deepEqual(arrangeHeroSlots(notes.slice(0, 3)), notes.slice(0, 3));
  });

  it("keeps a pinned card in the first place (top-left), whatever its height", () => {
    // The tall polaroid pinned: it still takes slot 0; the others fill the rest shortest-first.
    const arranged = arrangeHeroSlots(notes, ["tall-polaroid"]);
    assert.equal(arranged[0].id, "tall-polaroid");
    assert.deepEqual(arranged.map((n) => n.id).sort(), notes.map((n) => n.id).sort());
    const [, topRight, , bottomRight] = arranged;
    assert.ok(height(topRight) <= height(bottomRight), "the top-right slot gets a shorter card than the bottom-right");
    // The card under the pinned one is always the shortest of the others.
    for (const pin of notes.map((n) => n.id)) {
      const arrangedWithPin = arrangeHeroSlots(notes, [pin]);
      const others = arrangedWithPin.slice(1).map(height);
      assert.equal(height(arrangedWithPin[2]), Math.min(...others), `pinned ${pin}: bottom-left is the shortest`);
    }
    // With fewer than 4 cards too.
    assert.equal(arrangeHeroSlots(notes.slice(0, 2), ["tall-polaroid"])[0].id, "tall-polaroid");
  });
});
