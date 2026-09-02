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
