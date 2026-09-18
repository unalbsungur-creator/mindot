import type { Locale } from "@/i18n/config";
import type { NoteTemplateCategory, NoteTextFontFamily } from "@/features/notes/types";

/**
 * The public tile contract. Deliberately narrow: no authorId, no
 * invitationId, no moderation fields, no status, no email — nothing here
 * reveals anything beyond what's needed to render an already-approved
 * note. `author` is `null` for anonymous notes; the field simply doesn't
 * carry a name or image in that case, rather than the UI hiding it.
 */
export interface BoardTileAuthor {
  displayName: string;
  image: string | null;
}

export interface BoardTileMessage {
  id: string;
  content: string;
  templateId: string;
  /** EPIC — Kart Yazı Tipi Seçenekleri: the writer's own text typeface — rendering metadata, same privacy tier as `templateId`. */
  fontFamily: NoteTextFontFamily;
  position: { x: number; y: number };
  rotation: number;
  language: string;
  createdAt: string;
  author: BoardTileAuthor | null;
  /** EPIC: Message Like System — the real, current count; never reveals who liked it. */
  likeCount: number;
}

export interface BoardTile {
  x: number;
  y: number;
  messages: BoardTileMessage[];
}

/**
 * A single message's public detail, with its tile coordinates attached.
 * The coordinates aren't private — they're already implied by which tile
 * query would return this message — but they're not part of
 * `BoardTileMessage` since a tile's own response already knows its (x, y)
 * once for every message in it. Used by features/memories to resolve a
 * deterministic "surrounding wall" capture region for a specific note —
 * see getPublicMessageById below.
 */
export interface PublicMessageDetail extends BoardTileMessage {
  tileX: number;
  tileY: number;
}

/** Time-exploration foundation (EPIC 004 section 14) — not yet exposed in the UI. */
export interface BoardTimeRange {
  from?: Date;
  to?: Date;
}

/**
 * EPIC 021: board discovery filters — a keyword and/or a date range,
 * either optional but at least one expected to be set by the caller (see
 * `searchPublicMessages`'s own doc comment for why an all-empty call is
 * refused rather than silently returning "the whole board").
 *
 * EPIC "Paylaşılan Kartlarda Gelişmiş Filtreleme": `category` is the new
 * third, independent filter — same "at least one of these must be set"
 * rule applies, now counting a real (non-"all") category too. Deliberately
 * `NoteTemplateCategory` here (not a pre-resolved template id list) — this
 * type describes *what the caller asked for*; `searchPublicMessages`
 * itself resolves it to concrete template ids via
 * `templateIdsForCategory` right before querying, so nothing upstream of
 * that needs to know how categories map to ids.
 */
/**
 * EPIC — Duvar Filtreleme: Dil Tercihi — the fourth, independent filter,
 * same "at least one of these must be set" rule as `category`. This is
 * `message.language` (the writer's own explicit content-language choice
 * at submission time — see `WriteThoughtForm`'s language `<select>`, the
 * one and only source of truth this project already has for a message's
 * language; see CLAUDE.md's "Internationalization" section for why this
 * is deliberately distinct from the *interface* language) — never a
 * content-detection heuristic. A message whose stored `language` isn't
 * one of the five supported locale codes (there is no such row in
 * practice — the column has been `NOT NULL` since the very first
 * migration and the write form only ever sends one of these five — but
 * nothing enforces it at the database level) simply won't match any
 * specific language filter; it still shows under "Tümü"/"All".
 */
export interface BoardSearchFilters extends BoardTimeRange {
  keyword?: string;
  category?: NoteTemplateCategory;
  language?: Locale;
}
