/**
 * The public-facing identity behind a personal wall — deliberately narrow,
 * the same philosophy as BoardTileAuthor: no id, no email, no role,
 * nothing beyond what's needed to render the wall's header.
 */
export interface PublicProfile {
  publicId: string;
  displayName: string;
  image: string | null;
}

/**
 * One note on a personal wall. No `position`/`tileX`/`tileY` — unlike
 * BoardTileMessage, a personal wall isn't spatial (a user's own approved
 * messages are scattered across the *global* board's tiles wherever the
 * spiral placement happened to put them, not colocated with each other),
 * so it renders in a plain flow layout instead. `rotation` is still the
 * one carried over from board placement, purely for the same handwritten
 * visual personality — see "Personal wall architecture" in CLAUDE.md.
 */
export interface PersonalWallNote {
  id: string;
  content: string;
  templateId: string;
  rotation: number;
  language: string;
  createdAt: string;
}

/**
 * EPIC 011: the three states a visit to /u/[publicId] can land in, kept
 * distinct at the data level (not collapsed into `null`/empty) so the UI
 * can't accidentally conflate "doesn't exist" with "exists but private" —
 * see "Personal wall visibility" in CLAUDE.md.
 *
 * "not-found": no user has this publicId. No profile, nothing else.
 * "disabled": the user exists but has publicWallEnabled = false. Only the
 * narrow profile identity is resolved — messages are never queried for
 * this case, at the repository level, not just filtered afterward.
 * "ok": the wall is enabled; `notes` may still be empty (a distinct empty
 * state from "disabled" — see PublicWallContent).
 */
export type PublicWallResult =
  | { status: "not-found" }
  | { status: "disabled"; profile: PublicProfile }
  | { status: "ok"; profile: PublicProfile; description: string | null; notes: PersonalWallNote[] };

export type ArchiveMessageState = "pending" | "published" | "not_published";

/**
 * One message in the owner's own private archive — every status, for
 * their eyes only. Deliberately doesn't expose moderation internals (AI
 * categories/reason/confidence, moderatedBy) — `state` is the only signal
 * a user sees for why something isn't live yet.
 */
export interface ArchiveMessage {
  id: string;
  content: string;
  templateId: string;
  language: string;
  isAnonymous: boolean;
  createdAt: string;
  state: ArchiveMessageState;
  /** Set when this same user already started a Memory Project for this message. */
  memoryProjectId: string | null;
  /** EPIC 011: this message's own personal-wall curation flag — only meaningful (and only ever toggleable) when `state === "published"` and `isAnonymous === false`. */
  showOnPersonalWall: boolean;
  /** Board tile coordinates, for a "view on board" deep link — only present once published. */
  tile: { x: number; y: number } | null;
}

export interface TimeRange {
  from?: Date;
  to?: Date;
}

export type DigitalStatus = "not_applicable" | "waiting" | "granted";

/**
 * One row in the personal Memory Project library — composes
 * MemoryProject + its source message + its digital/physical fulfilment
 * state into one view-ready shape, so the page component stays a plain
 * renderer. See "Memory Project library" in CLAUDE.md.
 */
export interface MemoryLibraryItem {
  projectId: string;
  messageId: string;
  noteContent: string | null;
  noteTemplateId: string | null;
  noteLanguage: string | null;
  captureMode: "note_only" | "note_with_surrounding";
  outputType: "personal_pdf" | "digital_frame" | "physical_gift";
  frameName: string | null;
  createdAt: string;
  digitalStatus: DigitalStatus;
  physicalOrder: { orderNumber: string; status: string } | null;
}
