import type { NoteTemplate } from "../types";

/**
 * The template registry. Adding a future style — a heart-shaped Valentine's
 * note, a Mother's Day collection, a seasonal one-off — means adding an
 * entry here, not writing a new note component or touching the board.
 */
export const noteTemplates: NoteTemplate[] = [
  {
    id: "classic-yellow",
    name: "Classic Yellow Sticky",
    paper: "yellow",
    shape: "sticky",
    attachment: "none",
    font: "hand",
  },
  {
    id: "warm-cream",
    name: "Warm Cream Note",
    paper: "cream",
    shape: "sticky",
    attachment: "none",
    font: "hand",
  },
  {
    id: "torn-kraft",
    name: "Torn Kraft Paper",
    paper: "kraft",
    shape: "torn",
    attachment: "none",
    font: "sans",
  },
  {
    id: "folded-blue",
    name: "Folded Corner",
    paper: "blue",
    shape: "folded",
    attachment: "none",
    font: "sans",
  },
  {
    id: "minimal-white",
    name: "Minimal Card",
    paper: "white",
    shape: "minimal",
    attachment: "none",
    font: "sans",
  },
  {
    id: "vintage-cream",
    name: "Vintage Paper",
    paper: "cream",
    shape: "vintage",
    attachment: "none",
    font: "hand",
  },
  {
    id: "pinned-index",
    name: "Pinned Index Card",
    paper: "cream",
    shape: "index",
    attachment: "pin",
    font: "hand",
  },
  {
    id: "tape-white",
    name: "Tape-Attached Note",
    paper: "white",
    shape: "sticky",
    attachment: "tape",
    font: "hand",
  },
  {
    id: "polaroid",
    name: "Polaroid-Inspired",
    paper: "white",
    shape: "polaroid",
    attachment: "none",
    font: "hand",
  },
  {
    id: "notebook",
    name: "Notebook Paper",
    paper: "white",
    shape: "notebook",
    attachment: "none",
    font: "sans",
  },
  {
    id: "mint-square",
    name: "Mint Square",
    paper: "mint",
    shape: "sticky",
    attachment: "none",
    font: "hand",
  },
  {
    id: "blue-rect",
    name: "Blue Rectangle",
    paper: "blue",
    shape: "rect",
    attachment: "tape",
    font: "sans",
  },
  {
    id: "kraft-tag",
    name: "Kraft Tag",
    paper: "kraft",
    shape: "tag",
    attachment: "pin",
    font: "sans",
  },
  {
    id: "pink-square",
    name: "Pink Square",
    paper: "pink",
    shape: "sticky",
    attachment: "none",
    font: "hand",
  },
  // Seasonal example: demonstrates the scheduling architecture, not a
  // finished visual — it reuses the "sticky" shape rather than shipping a
  // bespoke heart shape now. Disabled until a real occasion enables it.
  {
    id: "valentines-heart",
    name: "Valentine's Note",
    paper: "pink",
    shape: "sticky",
    attachment: "pin",
    font: "hand",
    category: "seasonal",
    occasion: "valentines",
    availableFrom: "--02-07",
    availableUntil: "--02-15",
    enabled: false,
  },
];

export function getNoteTemplate(id: string): NoteTemplate {
  return noteTemplates.find((template) => template.id === id) ?? noteTemplates[0];
}

/**
 * A template is available when it's enabled (the default) and, if it
 * carries a schedule, the current date falls inside it. `availableFrom`/
 * `availableUntil` accept a full ISO date (`"2027-02-07"`) for a one-off
 * window, or a recurring `"--MM-DD"` form (no year) for something that
 * comes back every year, like Valentine's Day.
 */
export function isTemplateAvailable(template: NoteTemplate, now: Date = new Date()): boolean {
  if (template.enabled === false) return false;
  if (template.availableFrom && compareToBound(now, template.availableFrom) < 0) return false;
  if (template.availableUntil && compareToBound(now, template.availableUntil) > 0) return false;
  return true;
}

/** Templates a writer is currently allowed to pick from. */
export function getActiveNoteTemplates(now: Date = new Date()): NoteTemplate[] {
  return noteTemplates.filter((template) => isTemplateAvailable(template, now));
}

/**
 * Compares `now` against a bound: `"--MM-DD"` recurs every year (compared
 * as month-day only), a full `"YYYY-MM-DD"` is a one-off window (compared
 * in full). Returns <0 if `now` is before the bound, >0 if after, 0 if
 * equal. Lexicographic string comparison works because both forms are
 * zero-padded ISO-style dates.
 */
function compareToBound(now: Date, bound: string): number {
  const nowIso = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const recurring = bound.startsWith("--");
  const nowKey = recurring ? nowIso.slice(5) : nowIso; // MM-DD or YYYY-MM-DD
  const boundKey = recurring ? bound.slice(2) : bound;
  return nowKey < boundKey ? -1 : nowKey > boundKey ? 1 : 0;
}
