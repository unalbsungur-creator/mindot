import type { NoteShape, NoteTextAlign } from "../types";

/** Every value `messages.text_align` accepts — its CHECK constraint (migration 0024) lists exactly these. */
export const NOTE_TEXT_ALIGNS: readonly NoteTextAlign[] = ["auto", "left", "center", "right"];

/** Any stored, client-sent or missing value as a `NoteTextAlign`: anything unknown is `"auto"`, the card's own alignment. */
export function toNoteTextAlign(value: unknown): NoteTextAlign {
  return NOTE_TEXT_ALIGNS.includes(value as NoteTextAlign) ? (value as NoteTextAlign) : "auto";
}

/**
 * The alignment a card actually draws: the football disc is always
 * centered (its fit measures centered lines against the circle), so it
 * ignores the choice; every other card draws the choice, `"auto"` staying
 * its own alignment — what it drew before alignment could be chosen.
 */
export function effectiveTextAlign(value: NoteTextAlign | undefined, shape: NoteShape): NoteTextAlign {
  return shape === "football" ? "auto" : toNoteTextAlign(value);
}

/** The DOM class for an effective alignment — none for `"auto"`, so an `"auto"` card's markup is unchanged. */
export function textAlignClass(align: NoteTextAlign): string | undefined {
  switch (align) {
    case "left":
      return "text-left";
    case "center":
      return "text-center";
    case "right":
      return "text-right";
    default:
      return undefined;
  }
}
