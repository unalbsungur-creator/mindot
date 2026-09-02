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
  | "tag";

export type NoteAttachment = "none" | "tape" | "pin";

export type NoteFont = "hand" | "sans";

export type NoteSize = "sm" | "md" | "lg";

export type NoteTemplateCategory = "standard" | "seasonal";

/**
 * A template is a reusable visual style. Registering a new template — for a
 * seasonal collection, say — is how MINDOT gains a new note design; it never
 * requires a new one-off component or changes to how notes are placed.
 *
 * `category`/`occasion`/`availableFrom`/`availableUntil`/`enabled` let a
 * seasonal template be scheduled or toggled without touching the board or
 * message system — see `isTemplateAvailable` in `config/templates.ts`.
 */
export interface NoteTemplate {
  id: string;
  name: string;
  paper: NotePaperTone;
  shape: NoteShape;
  attachment: NoteAttachment;
  font: NoteFont;
  category?: NoteTemplateCategory;
  occasion?: string;
  availableFrom?: string;
  availableUntil?: string;
  enabled?: boolean;
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
}
