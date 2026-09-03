import type { NoteTemplate } from "../types";

/**
 * The template registry. Adding a future style — a heart-shaped Valentine's
 * note, a Mother's Day collection, a seasonal one-off — means adding an
 * entry here, not writing a new note component or touching the board.
 *
 * EPIC: Özel ve Standart Post-it Görsellerini Gerçek PNG Dosyalarıyla
 * Değiştir. Every entry's `image`/`imageWidth`/`imageHeight` point at the
 * real designed artwork in `public/images/postits/` — filenames match the
 * actual files on disk exactly (including "blue ractangle.png"'s existing
 * typo and each file's original spacing/casing), read directly, not
 * guessed. Only TemplatePicker consumes these fields; `paper`/`shape`/
 * `attachment`/`font`/`decoration` below are unchanged and still drive
 * every other render (board, live write-flow preview, PDF, share cards).
 */
export const noteTemplates: NoteTemplate[] = [
  {
    id: "classic-yellow",
    name: "Classic Yellow Sticky",
    paper: "yellow",
    shape: "sticky",
    attachment: "none",
    font: "hand",
    image: "/images/postits/Classic Yellow Sticky.png",
    imageWidth: 227,
    imageHeight: 210,
  },
  {
    id: "warm-cream",
    name: "Warm Cream Note",
    paper: "cream",
    shape: "sticky",
    attachment: "none",
    font: "hand",
    image: "/images/postits/warm cream.png",
    imageWidth: 214,
    imageHeight: 212,
  },
  {
    id: "torn-kraft",
    name: "Torn Kraft Paper",
    paper: "kraft",
    shape: "torn",
    attachment: "none",
    font: "sans",
    image: "/images/postits/torn kraft.png",
    imageWidth: 206,
    imageHeight: 212,
  },
  {
    id: "folded-blue",
    name: "Folded Corner",
    paper: "blue",
    shape: "folded",
    attachment: "none",
    font: "sans",
    image: "/images/postits/folded corner.png",
    imageWidth: 205,
    imageHeight: 206,
  },
  {
    id: "minimal-white",
    name: "Minimal Card",
    paper: "white",
    shape: "minimal",
    attachment: "none",
    font: "sans",
    image: "/images/postits/minimal card.png",
    imageWidth: 216,
    imageHeight: 194,
  },
  {
    id: "vintage-cream",
    name: "Vintage Paper",
    paper: "cream",
    shape: "vintage",
    attachment: "none",
    font: "hand",
    image: "/images/postits/vintage paper.png",
    imageWidth: 213,
    imageHeight: 193,
  },
  {
    id: "pinned-index",
    name: "Pinned Index Card",
    paper: "cream",
    shape: "index",
    attachment: "pin",
    font: "hand",
    image: "/images/postits/pinned index card.png",
    imageWidth: 199,
    imageHeight: 195,
  },
  {
    id: "tape-white",
    name: "Tape-Attached Note",
    paper: "white",
    shape: "sticky",
    attachment: "tape",
    font: "hand",
    image: "/images/postits/tape attached note.png",
    imageWidth: 210,
    imageHeight: 204,
  },
  {
    id: "polaroid",
    name: "Polaroid-Inspired",
    paper: "white",
    shape: "polaroid",
    attachment: "none",
    font: "hand",
    image: "/images/postits/polaroid inspired.png",
    imageWidth: 211,
    imageHeight: 217,
  },
  {
    id: "notebook",
    name: "Notebook Paper",
    paper: "white",
    shape: "notebook",
    attachment: "none",
    font: "sans",
    image: "/images/postits/notebook paper.png",
    imageWidth: 203,
    imageHeight: 207,
  },
  {
    id: "mint-square",
    name: "Mint Square",
    paper: "mint",
    shape: "sticky",
    attachment: "none",
    font: "hand",
    image: "/images/postits/mint square.png",
    imageWidth: 202,
    imageHeight: 202,
  },
  {
    id: "blue-rect",
    name: "Blue Rectangle",
    paper: "blue",
    shape: "rect",
    attachment: "tape",
    font: "sans",
    // Actual filename on disk has a typo ("ractangle") — referenced as-is
    // rather than renaming the designer-provided asset.
    image: "/images/postits/blue ractangle.png",
    imageWidth: 199,
    imageHeight: 204,
  },
  {
    id: "kraft-tag",
    name: "Kraft Tag",
    paper: "kraft",
    shape: "tag",
    attachment: "pin",
    font: "sans",
    image: "/images/postits/kraft tag.png",
    imageWidth: 200,
    imageHeight: 169,
  },
  {
    id: "pink-square",
    name: "Pink Square",
    paper: "pink",
    shape: "sticky",
    attachment: "none",
    font: "hand",
    image: "/images/postits/pink square.png",
    imageWidth: 202,
    imageHeight: 170,
  },
  // EPIC: Özel Günler İçin Tercih Edilebilir Post-it Tasarımları /
  // Special Day Post-it Shapes & Decorative Styles. Eight special-occasion
  // templates, permanently selectable (no availableFrom/availableUntil —
  // a writer can pick "Birthday" in July) rather than date-scheduled like
  // a true seasonal drop would be; `category: "seasonal"` still groups
  // them under "Special occasions" in the write flow's TemplatePicker,
  // separate from the standard collection above. Each has its own
  // dedicated `shape` id (see NoteShape/Note.tsx's shapeClasses) so the
  // card's own silhouette — not just its paper color — reads as distinct
  // from every standard template and from every other occasion; that CSS
  // shape system still backs the real Note component everywhere except
  // TemplatePicker (see `image` above).
  {
    id: "birthday-confetti",
    name: "Birthday Confetti",
    paper: "yellow",
    shape: "confetti",
    attachment: "pin",
    font: "hand",
    decoration: "confetti",
    category: "seasonal",
    occasion: "birthday",
    image: "/images/postits/birthday confetti.png",
    imageWidth: 227,
    imageHeight: 221,
  },
  // Upgrades the original scheduling-architecture placeholder into a real,
  // permanently-available design for this EPIC — it was never enabled, so
  // no note has ever been created with this id through the normal write
  // flow; existing id kept for continuity rather than introducing a
  // second, redundant Valentine's entry. `shape: "heart"` is the one
  // silhouette that must NOT just be a rounded rectangle with a heart
  // icon — see Note.tsx's clip-path implementation.
  {
    id: "valentines-heart",
    name: "Valentine's Note",
    paper: "pink",
    shape: "heart",
    attachment: "none",
    font: "hand",
    decoration: "hearts",
    category: "seasonal",
    occasion: "valentines",
    image: "/images/postits/valentines note.png",
    imageWidth: 212,
    imageHeight: 218,
  },
  {
    id: "mothers-day-bloom",
    name: "Mother's Day Bloom",
    paper: "cream",
    shape: "bloom",
    attachment: "none",
    font: "hand",
    decoration: "florals",
    category: "seasonal",
    occasion: "mothers-day",
    image: "/images/postits/mothers day bloom.png",
    imageWidth: 218,
    imageHeight: 224,
  },
  // Deliberately not "Mother's Day with a different paper color": different
  // paper, different shape (soft organic "bloom" vs. angular cut-corner
  // "craft"), different font (sans vs. hand), different decoration.
  {
    id: "fathers-day-craft",
    name: "Father's Day Craft",
    paper: "kraft",
    shape: "craft",
    attachment: "none",
    font: "sans",
    decoration: "compass",
    category: "seasonal",
    occasion: "fathers-day",
    image: "/images/postits/fathers day craft.png",
    imageWidth: 206,
    imageHeight: 205,
  },
  {
    id: "new-year-frost",
    name: "New Year Frost",
    paper: "white",
    shape: "frost",
    attachment: "none",
    font: "sans",
    decoration: "snowflake",
    category: "seasonal",
    occasion: "new-year",
    image: "/images/postits/new year frost.png",
    imageWidth: 231,
    imageHeight: 189,
  },
  {
    id: "graduation-honor",
    name: "Graduation Honor",
    paper: "blue",
    shape: "diploma",
    attachment: "pin",
    font: "sans",
    decoration: "graduation-cap",
    category: "seasonal",
    occasion: "graduation",
    image: "/images/postits/graduation honor.png",
    imageWidth: 217,
    imageHeight: 195,
  },
  {
    id: "celebration-spark",
    name: "Celebration Spark",
    paper: "mint",
    shape: "burst",
    attachment: "tape",
    font: "hand",
    decoration: "sparkle",
    category: "seasonal",
    occasion: "celebration",
    image: "/images/postits/celebration spark.png",
    imageWidth: 222,
    imageHeight: 202,
  },
  // General-purpose — not tied to a specific date the way the other seven
  // are, per this EPIC's "Tebrik / Özel Gün" spec.
  {
    id: "congratulations-note",
    name: "Congratulations Note",
    paper: "cream",
    shape: "ribbon",
    attachment: "none",
    font: "sans",
    decoration: "stars",
    category: "seasonal",
    occasion: "congratulations",
    image: "/images/postits/congratulations note.png",
    imageWidth: 221,
    imageHeight: 184,
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
