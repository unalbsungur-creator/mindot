export type NotePaperTone =
  | "yellow"
  | "cream"
  | "blue"
  | "pink"
  | "kraft"
  | "white"
  | "mint";

export type NoteShape =
  | "sticky"
  | "rect"
  | "torn"
  | "folded"
  | "minimal"
  | "vintage"
  | "index"
  | "polaroid"
  | "notebook"
  | "tag"
  // EPIC: Special Day Post-it Shapes & Decorative Styles — one dedicated
  // silhouette per special-occasion template, never reused by a standard
  // template's `shape` (so this addition can never change how any existing
  // standard design renders — see Note.tsx's shapeClasses).
  | "confetti"
  | "heart"
  | "bloom"
  | "craft"
  | "frost"
  | "diploma"
  | "burst"
  | "ribbon"
  // EPIC 039: the one shape for the "Spor" category — a round, two-tone
  // "football" card. Never reused by a standard/seasonal template's
  // `shape`, exactly like every other occasion-only shape above.
  | "football";

export type NoteAttachment = "none" | "tape" | "pin";

export type NoteFont = "hand" | "sans";

/**
 * EPIC — Kart Yazı Tipi Seçenekleri: an independent, user-chosen typeface
 * for a note's own text — separate from `NoteTemplate.font` above (which
 * is a property of the *template*'s paper design, still read by nothing
 * outside `config/templates.ts`/`TemplatePicker`'s own preview swatches).
 * Stored on the message itself (`NoteData.fontFamily`/`Message.fontFamily`,
 * see features/messages/types.ts), defaulting to `"modern"` for any
 * message that predates this feature — see `noteTextScaleClasses` in
 * `lib/textScale.ts`, the one place both this and the EPIC 045 length-based
 * size tiering come together.
 */
export type NoteTextFontFamily = "modern" | "classic" | "handwritten" | "typewriter";

export type NoteSize = "sm" | "md" | "lg";

export type NoteTemplateCategory = "standard" | "seasonal" | "sports";

/**
 * EPIC 039: a closed, small color vocabulary for the "Spor" (sports)
 * category's round two-tone cards — never free text. Two purposes: (1)
 * `Note.tsx`/`lib/sportsBall.ts` map each key to one representative hex so
 * every ball renders consistently, and (2) each key has a translated word
 * in every locale (`Dictionary.write.sportsColorNames`) that builds the
 * card's `aria-label` (e.g. "Sports card — yellow and red") — the only
 * user-facing description of a sports card's identity. A club's real name
 * is never stored on a `NoteTemplate` at all (see config/templates.ts's
 * sports entries) precisely so it can never leak into any UI, accidental
 * console log, or future careless render.
 */
export type SportsColorKey =
  | "yellow"
  | "red"
  | "navy"
  | "black"
  | "white"
  | "green"
  | "maroon"
  | "blue"
  | "orange"
  | "purple";

/**
 * EPIC: Özel Günler İçin Tercih Edilebilir Post-it Tasarımları. A small,
 * optional decorative motif rendered in a template's corner — the one new
 * visual primitive this EPIC adds, on top of the existing paper/shape/
 * attachment/font vocabulary. Kept deliberately tiny and CSS/SVG-only (no
 * image assets): the note's content must always stay the visually dominant
 * element, never the decoration. Undefined for every standard template —
 * unrelated to and independent of `category`/`occasion` below.
 */
export type NoteDecoration =
  | "confetti"
  | "hearts"
  | "florals"
  | "compass"
  | "snowflake"
  | "graduation-cap"
  | "sparkle"
  | "stars";

/**
 * A template is a reusable visual style. Registering a new template — for a
 * seasonal collection, say — is how MINDOT gains a new note design; it never
 * requires a new one-off component or changes to how notes are placed.
 *
 * `category`/`occasion`/`availableFrom`/`availableUntil`/`enabled` let a
 * seasonal template be scheduled or toggled without touching the board or
 * message system — see `isTemplateAvailable` in `config/templates.ts`. A
 * seasonal template does NOT have to be date-scheduled: leaving
 * `availableFrom`/`availableUntil` unset makes it permanently selectable
 * (still grouped as "seasonal" for the write flow's UI, but never
 * time-gated) — see the "Özel Günler" (special-occasion) entries in
 * `config/templates.ts` for real examples of that permanent form, versus
 * `availableFrom`/`availableUntil` still being reserved for a genuinely
 * date-windowed collection in the future.
 */
export interface NoteTemplate {
  id: string;
  name: string;
  paper: NotePaperTone;
  shape: NoteShape;
  attachment: NoteAttachment;
  font: NoteFont;
  decoration?: NoteDecoration;
  category?: NoteTemplateCategory;
  occasion?: string;
  availableFrom?: string;
  availableUntil?: string;
  enabled?: boolean;
  /**
   * EPIC: Özel ve Standart Post-it Görsellerini Gerçek PNG Dosyalarıyla
   * Değiştir. The real designed preview artwork for this template — a
   * `public/images/postits/*.png` path — used only by the write flow's
   * TemplatePicker (whose preview content is always the fixed "Aa" / "—
   * <template name>" placeholder these images already have baked in).
   * `imageWidth`/`imageHeight` are the PNG's real intrinsic pixel
   * dimensions, required by next/image for a `public/`-referenced (not
   * statically imported) local image to size itself without stretching or
   * cropping. Deliberately NOT consumed by the general `Note` component —
   * a real note's content/author varies per message and can never be a
   * static baked-in image; Note.tsx keeps rendering its paper/shape/
   * attachment/font/decoration system for every other context (board,
   * live write-flow preview, PDF, share cards).
   *
   * EPIC 039: optional now — `category: "sports"` templates have no PNG at
   * all (see `primaryColor`/`secondaryColor` below); TemplatePicker
   * branches on `category`/`shape` to render a CSS ball instead of an
   * `<Image>` for those, everything else keeps requiring a real image.
   */
  image?: string;
  imageWidth?: number;
  imageHeight?: number;
  /**
   * EPIC 039: `category: "sports"` only — the round card's two (optionally
   * three, with `accentColor`) panel colors, drawn by
   * `features/notes/lib/sportsBall.ts` and reused identically by both
   * TemplatePicker's picker option and Note.tsx's real-content rendering.
   * See `SportsColorKey`'s doc comment above for why this is a closed
   * color vocabulary rather than free text or a team name.
   */
  primaryColor?: SportsColorKey;
  secondaryColor?: SportsColorKey;
  accentColor?: SportsColorKey;
}

/**
 * A note is content plus placement. Its `templateId` is the only link to
 * how it's rendered. `language` is optional metadata about the thought's
 * own language — independent of whatever interface language is showing it.
 */
export interface NoteData {
  id: string;
  content: string;
  authorName: string;
  /** Google profile photo URL — only ever set for a non-anonymous note; see features/board's privacy contract. */
  authorImage?: string | null;
  templateId: string;
  size: NoteSize;
  rotation: number;
  position: { top: string; left: string };
  language?: string;
  /** EPIC — Kart Yazı Tipi Seçenekleri: defaults to `"modern"` when absent (e.g. any `NoteData` built before this field existed — sample notes, older call sites) — never left `undefined` all the way down to Note.tsx's own rendering logic. */
  fontFamily?: NoteTextFontFamily;
}
