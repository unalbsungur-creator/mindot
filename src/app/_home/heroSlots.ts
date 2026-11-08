import { estimateNoteFootprint } from "@/features/notes/lib/footprint";
import type { NoteData } from "@/features/notes/types";

const height = (note: NoteData) => estimateNoteFootprint(note.templateId, note.content, note.fontFamily).height;

/**
 * MB-01: the homepage composition pins its 4 cards to the corners of a fixed
 * square — slots 0 top-left, 1 top-right, 2 bottom-left, 3 bottom-right — so
 * two tall cards (a polaroid, long text) in one column grow into each other
 * and one hides the other.
 *
 * - Pinned cards (`pinnedIds`, fixedMessages.ts) keep the first slots, in
 *   their own order: "Merhaba Dünya" is always top-left.
 * - With one pinned card, the shortest other card goes under it
 *   (bottom-left), so nothing tall grows up into the pinned card; the right
 *   column gets the other two, the shorter on top. (Measured on the real
 *   homepage: a long text card renders far taller in the narrow hero than
 *   the footprint estimate says, so "shortest" is the only safe choice.)
 * - With no pinned card, each column gets one of the two tallest (bottom)
 *   and one of the two shortest (top).
 *
 * Fewer than 4 cards keep their order (pinned first). Deterministic: the
 * same notes always land in the same slots.
 */
export function arrangeHeroSlots(notes: NoteData[], pinnedIds: readonly string[] = []): NoteData[] {
  const pinned = notes.filter((note) => pinnedIds.includes(note.id));
  const others = notes.filter((note) => !pinnedIds.includes(note.id));
  if (notes.length < 4) return [...pinned, ...others];

  const sorted = others
    .map((note, index) => ({ note, index, height: height(note) }))
    .sort((a, b) => a.height - b.height || a.index - b.index)
    .map((entry) => entry.note);
  if (pinned.length === 1) {
    // Shortest under the pinned card; the right column gets the other two, the shorter on top.
    const [shortest, middle, tallest] = sorted;
    return [pinned[0], middle, shortest, tallest];
  }
  if (pinned.length > 0) return [...pinned, ...sorted].slice(0, 4);

  const [short1, short2, tall1, tall2] = sorted;
  return [short1, short2, tall2, tall1];
}
