import type { NoteTemplate, NoteTemplateCategory } from "../types";

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
    // EPIC: Kart Tasarımı Fidelity pilot — `paper`/`shape`/`attachment`/
    // `decoration` below are no longer read for this template's real
    // rendering (Note.tsx's `isImageBacked` branch takes over the moment
    // `contentArea` is set); kept as-is only so this row still matches the
    // `NoteTemplate` shape and so `TemplateCategoryNav`'s "seasonal"
    // grouping / `isTemplateAvailable` continue to work unchanged.
    paper: "yellow",
    shape: "confetti",
    attachment: "pin",
    font: "hand",
    decoration: "confetti",
    category: "seasonal",
    occasion: "birthday",
    // Replaced with the real, text-free artwork (was a 227×221 thumbnail
    // with "Aa — Birthday Confetti" baked into its pixels — see the EPIC's
    // own clean-asset feasibility findings for why that couldn't be reused
    // directly). Same filename/path, so TemplatePicker needs no change.
    image: "/images/postits/birthday confetti.png",
    imageWidth: 507,
    imageHeight: 492,
    // Center rectangle confirmed empty by direct pixel inspection (>=94%
    // "paper color" fraction across this whole box at every row/column,
    // zero overlap with the bunting/hearts/balloons/ribbon/cake/confetti —
    // see the EPIC's own analysis script output). Enlarged from an earlier,
    // more conservative box after real DOM measurement showed
    // MESSAGE_MAX_LENGTH content overflowing it (author line rendering
    // ~46px past the box's own bottom edge) — paired with
    // `IMAGE_BACKED_TEXT_SCALE` (lib/textScale.ts) so long content shrinks
    // enough to actually fit this real, artwork-safe area rather than the
    // box being stretched into decorated space to compensate.
    contentArea: { top: "27%", left: "13%", width: "66%", height: "41%" },
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
    // EPIC: Special Day Clean Artwork — see birthday-confetti's own comment
    // above for the full rationale; `paper`/`shape`/`attachment`/
    // `decoration` below are inert for this template's real rendering once
    // `contentArea` is set.
    paper: "pink",
    shape: "heart",
    attachment: "none",
    font: "hand",
    decoration: "hearts",
    category: "seasonal",
    occasion: "valentines",
    // Replaced with real, text-free artwork (was a 212×218 thumbnail with
    // "Aa — Valentine's Note" baked into its pixels).
    image: "/images/postits/valentines note.png",
    imageWidth: 507,
    imageHeight: 492,
    // Clean rectangle confirmed by direct pixel inspection (row/column
    // "paper color" purity scan + visual debug-box verification) — clear of
    // the corner heart clusters, floral sprigs, and the top-right ribbon tag.
    contentArea: { top: "30%", left: "18%", width: "64%", height: "42%" },
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
    // Replaced with real, text-free artwork (was a 218×224 thumbnail with
    // "Aa — Mother's Day Bloom" baked into its pixels).
    image: "/images/postits/mothers day bloom.png",
    imageWidth: 500,
    imageHeight: 500,
    // Narrower than most other Special Day boxes — this artwork's floral
    // clusters (top-left) and ribbon-wrapped tulips (bottom-right) intrude
    // diagonally further than a typical two-corner layout, confirmed by
    // pixel scan; the safe rectangle sits centered, clear of both.
    contentArea: { top: "28%", left: "31%", width: "44%", height: "48%" },
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
    // Replaced with real, text-free artwork (was a 206×205 thumbnail with
    // "Aa — Father's Day Craft" baked into its pixels). The artwork itself
    // carries a fixed "Best Dad Ever" corner tag (bottom-right, part of the
    // stock design, not a template placeholder) — `contentArea` stays clear
    // of it, same as it stays clear of the tie/gift/heart-tag decorations.
    image: "/images/postits/fathers day craft.png",
    imageWidth: 500,
    imageHeight: 500,
    contentArea: { top: "32%", left: "24%", width: "56%", height: "40%" },
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
    // Replaced with real, text-free artwork (was a 231×189 thumbnail with
    // "Aa — New Year Frost" baked into its pixels).
    image: "/images/postits/new year frost.png",
    imageWidth: 500,
    imageHeight: 500,
    contentArea: { top: "30%", left: "30%", width: "50%", height: "48%" },
  },
  {
    id: "graduation-honor",
    name: "Graduation Honor",
    paper: "blue",
    shape: "diploma",
    // BUG FIX: Kart Tasarımı QA — the real artwork has no pin/attachment at
    // all (the cap sitting in its own corner already reads as "affixed");
    // "pin" here rendered a floating orange dot top-center that the
    // reference image never shows, a real fidelity mismatch caught by
    // visual QA against graduation honor.png.
    attachment: "none",
    font: "sans",
    decoration: "graduation-cap",
    category: "seasonal",
    occasion: "graduation",
    // Replaced with real, text-free artwork (was a 217×195 thumbnail with
    // "Aa — Graduation Honor" baked into its pixels). The artwork carries a
    // fixed "DREAM / LEARN / ACHIEVE" book-spine detail bottom-right (part
    // of the stock design) — `contentArea` stays clear of it.
    image: "/images/postits/graduation honor.png",
    imageWidth: 500,
    imageHeight: 500,
    contentArea: { top: "31%", left: "32%", width: "46%", height: "50%" },
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
    // Replaced with real, text-free artwork (was a 222×202 thumbnail with
    // "Aa — Celebration Spark" baked into its pixels). Unlike every other
    // Special Day artwork, this one's own center is genuinely transparent
    // (a decorative *frame*, not a filled card — confirmed via raw alpha
    // sampling: alpha=0 at 50%/50%), so `contentArea` sits in that
    // transparent region rather than a painted paper color; verified in
    // real-browser QA that this reads fine over the board's own light
    // background, not as a visual defect.
    image: "/images/postits/celebration spark.png",
    imageWidth: 720,
    imageHeight: 720,
    contentArea: { top: "28%", left: "32%", width: "56%", height: "42%" },
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
    // Replaced with real, text-free artwork (was a 221×184 thumbnail with
    // "Aa — Congratulations Note" baked into its pixels). Same genuinely-
    // transparent-center design as celebration-spark above — see that
    // entry's comment.
    image: "/images/postits/congratulations note.png",
    imageWidth: 720,
    imageHeight: 720,
    contentArea: { top: "18%", left: "28%", width: "56%", height: "42%" },
  },
  // EPIC 039: "Spor" category — round, two-tone "football" cards. Colors
  // only; no team name/logo/crest/abbreviation is ever stored on these
  // entries or rendered anywhere in the UI (see `SportsColorKey`'s doc
  // comment in ../types.ts and Note.tsx/SportsTemplateCard.tsx's
  // rendering) — the "echoes:" comment beside each entry is a
  // maintainer-only research/traceability note, never a data field, so it
  // can never leak into any UI, log, or accessible name.
  //
  // One card per *unique* primary+secondary color pair (order-independent
  // — "yellow+red" and "red+yellow" are the same pair) found across the
  // real 2026-27 Trendyol Süper Lig (18 clubs, confirmed via Wikipedia +
  // TFF season-planning announcements) and Trendyol 1. Lig (20 clubs,
  // same sourcing) — a pair shared by several real clubs collapses to one
  // card rather than repeating the same combination multiple times, per
  // this EPIC's brief. All four explicitly required classic combinations
  // are present: yellow+red, yellow+navy, black+white, maroon+blue.
  //
  // `paper: "white"` / `attachment: "none"` / `font: "sans"` below are
  // inert fallbacks only ever read by the PDF/share secondary renderers
  // (noteCardPdf.tsx / noteCardSatori.tsx render a plain light circle,
  // deliberately not reproducing the two-tone ball there — see those
  // files' own EPIC 039 comments); the app's real rendering (Note.tsx,
  // TemplatePicker/SportsTemplateCard) uses `primaryColor`/
  // `secondaryColor`/`accentColor` instead and never reads `paper` here.
  {
    id: "sport-yellow-red",
    name: "Football — Yellow & Red",
    paper: "white",
    shape: "football",
    attachment: "none",
    font: "sans",
    category: "sports",
    primaryColor: "yellow",
    secondaryColor: "red",
  }, // echoes: Galatasaray, Göztepe, Kayserispor
  {
    id: "sport-yellow-navy",
    name: "Football — Yellow & Navy",
    paper: "white",
    shape: "football",
    attachment: "none",
    font: "sans",
    category: "sports",
    primaryColor: "yellow",
    secondaryColor: "navy",
  }, // echoes: Fenerbahçe
  {
    id: "sport-black-white",
    name: "Football — Black & White",
    paper: "white",
    shape: "football",
    attachment: "none",
    font: "sans",
    category: "sports",
    primaryColor: "black",
    secondaryColor: "white",
  }, // echoes: Beşiktaş, Manisa FK
  {
    id: "sport-maroon-blue",
    name: "Football — Maroon & Blue",
    paper: "white",
    shape: "football",
    attachment: "none",
    font: "sans",
    category: "sports",
    primaryColor: "maroon",
    secondaryColor: "blue",
  }, // echoes: Trabzonspor
  {
    id: "sport-red-white",
    name: "Football — Red & White",
    paper: "white",
    shape: "football",
    attachment: "none",
    font: "sans",
    category: "sports",
    primaryColor: "red",
    secondaryColor: "white",
  }, // echoes: Samsunspor, Antalyaspor, Batman Petrolspor, Boluspor, Pendikspor, Sivasspor
  {
    id: "sport-red-black",
    name: "Football — Red & Black",
    paper: "white",
    shape: "football",
    attachment: "none",
    font: "sans",
    category: "sports",
    primaryColor: "red",
    secondaryColor: "black",
  }, // echoes: Çorum FK, Gaziantep FK, Gençlerbirliği, Fatih Karagümrük, Vanspor FK
  {
    id: "sport-red-navy",
    name: "Football — Red & Navy",
    paper: "white",
    shape: "football",
    attachment: "none",
    font: "sans",
    category: "sports",
    primaryColor: "red",
    secondaryColor: "navy",
  }, // echoes: Mardin 1969 S.K.
  {
    id: "sport-green-white",
    name: "Football — Green & White",
    paper: "white",
    shape: "football",
    attachment: "none",
    font: "sans",
    category: "sports",
    primaryColor: "green",
    secondaryColor: "white",
  }, // echoes: Konyaspor, Bursaspor, Bodrum F.K., Iğdır F.K., Muğlaspor
  {
    id: "sport-green-black",
    name: "Football — Green & Black",
    paper: "white",
    shape: "football",
    attachment: "none",
    font: "sans",
    category: "sports",
    primaryColor: "green",
    secondaryColor: "black",
  }, // echoes: Kocaelispor, Ümraniyespor
  {
    id: "sport-green-blue",
    name: "Football — Green & Blue",
    paper: "white",
    shape: "football",
    attachment: "none",
    font: "sans",
    category: "sports",
    primaryColor: "green",
    secondaryColor: "blue",
  }, // echoes: Çaykur Rizespor
  {
    id: "sport-green-yellow",
    name: "Football — Green & Yellow",
    paper: "white",
    shape: "football",
    attachment: "none",
    font: "sans",
    category: "sports",
    primaryColor: "green",
    secondaryColor: "yellow",
  }, // echoes: Esenler Erokspor
  {
    id: "sport-orange-green",
    name: "Football — Orange & Green",
    paper: "white",
    shape: "football",
    attachment: "none",
    font: "sans",
    category: "sports",
    primaryColor: "orange",
    secondaryColor: "green",
  }, // echoes: Alanyaspor
  {
    id: "sport-orange-navy",
    name: "Football — Orange & Navy",
    paper: "white",
    shape: "football",
    attachment: "none",
    font: "sans",
    category: "sports",
    primaryColor: "orange",
    secondaryColor: "navy",
  }, // echoes: İstanbul Başakşehir
  {
    id: "sport-navy-white",
    name: "Football — Navy & White",
    paper: "white",
    shape: "football",
    attachment: "none",
    font: "sans",
    category: "sports",
    primaryColor: "navy",
    secondaryColor: "white",
  }, // echoes: Kasımpaşa, Sarıyer S.K.
  {
    id: "sport-blue-white",
    name: "Football — Blue & White",
    paper: "white",
    shape: "football",
    attachment: "none",
    font: "sans",
    category: "sports",
    primaryColor: "blue",
    secondaryColor: "white",
  }, // echoes: Erzurumspor FK
  {
    id: "sport-purple-yellow",
    name: "Football — Purple & Yellow",
    paper: "white",
    shape: "football",
    attachment: "none",
    font: "sans",
    category: "sports",
    primaryColor: "purple",
    secondaryColor: "yellow",
  }, // echoes: Eyüpspor
  {
    id: "sport-purple-white",
    name: "Football — Purple & White",
    paper: "white",
    shape: "football",
    attachment: "none",
    font: "sans",
    category: "sports",
    primaryColor: "purple",
    secondaryColor: "white",
  }, // echoes: Ankara Keçiörengücü S.K.
  {
    id: "sport-maroon-white",
    name: "Football — Maroon & White",
    paper: "white",
    shape: "football",
    attachment: "none",
    font: "sans",
    category: "sports",
    primaryColor: "maroon",
    secondaryColor: "white",
  }, // echoes: Bandırmaspor
  {
    id: "sport-yellow-black",
    name: "Football — Yellow & Black",
    paper: "white",
    shape: "football",
    attachment: "none",
    font: "sans",
    category: "sports",
    primaryColor: "yellow",
    secondaryColor: "black",
  }, // echoes: İstanbulspor
  {
    id: "sport-green-red-white",
    name: "Football — Green, Red & White",
    paper: "white",
    shape: "football",
    attachment: "none",
    font: "sans",
    category: "sports",
    primaryColor: "green",
    secondaryColor: "red",
    accentColor: "white",
  }, // echoes: Amed SFK (tricolor)
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
 * EPIC — Paylaşılan Kartlarda Gelişmiş Filtreleme: the one place "which
 * template ids count as Standard/Özel Günler/Spor" is decided, so the new
 * board-search category filter (features/board/repository.ts) and the
 * write flow's own category picker (TemplatePicker.tsx, unchanged by this
 * EPIC — its inline `category === undefined || category === "standard"`
 * check predates this and still works fine there) agree on the same
 * classification without either duplicating the other's logic. A
 * template with no `category` field, or an explicit `"standard"`, both
 * count as Standard — same convention as everywhere else in this file.
 */
export function templateIdsForCategory(category: NoteTemplateCategory): string[] {
  return noteTemplates
    .filter((template) => {
      if (category === "sports") return template.category === "sports";
      if (category === "seasonal") return template.category === "seasonal";
      return template.category === undefined || template.category === "standard";
    })
    .map((template) => template.id);
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
