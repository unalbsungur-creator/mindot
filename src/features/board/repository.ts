import { messageRepository } from "@/features/messages/repository";
import { userRepository } from "@/features/users/repository";
import type { BoardSearchFilters, BoardTile, BoardTileAuthor, BoardTileMessage, BoardTimeRange, PublicMessageDetail } from "./types";

/**
 * EPIC 021: caps board discovery results the same way every other
 * "small, admin- or user-facing, no pagination" list in this codebase
 * already does (see `getPrivateArchive`/`getMemoryLibrary`'s own 60-row
 * cap) — a known, documented limit, not a silent truncation.
 */
const SEARCH_RESULT_LIMIT = 60;

/**
 * The public board's only read path. Goes through
 * `messageRepository.listApprovedByTile`, which filters to `status =
 * "approved"` at the query level — pending and rejected messages are never
 * fetched here, let alone returned. Author display data is resolved
 * separately and only for non-anonymous messages (batched, one lookup for
 * the whole tile) — an anonymous message's `authorId` is never used to
 * fetch anything, so its author's identity never enters this function's
 * output at all. Maps down to the narrow `BoardTile*` contract before the
 * data ever reaches a route handler or component.
 */
export async function getTile(x: number, y: number, range?: BoardTimeRange): Promise<BoardTile> {
  const approved = await messageRepository.listApprovedByTile(x, y, range);
  const placed = approved.filter(
    (message) => message.positionX !== null && message.positionY !== null && message.rotation !== null
  );

  const namedAuthorIds = [...new Set(placed.filter((m) => !m.isAnonymous).map((m) => m.authorId))];
  const authors = namedAuthorIds.length > 0 ? await userRepository.getByIds(namedAuthorIds) : [];
  const imageByUserId = new Map(authors.map((author) => [author.id, author.image]));

  const messages: BoardTileMessage[] = placed.map((message) => {
    const author: BoardTileAuthor | null = message.isAnonymous
      ? null
      : { displayName: message.authorName, image: imageByUserId.get(message.authorId) ?? null };

    return {
      id: message.id,
      content: message.content,
      templateId: message.templateId,
      position: { x: message.positionX as number, y: message.positionY as number },
      rotation: message.rotation as number,
      language: message.language,
      createdAt: message.createdAt,
      author,
      likeCount: message.likeCount,
    };
  });

  return { x, y, messages };
}

/**
 * A single message's public detail, by id — `null` unless it exists, is
 * `status = "approved"`, and has a placement. Used by features/memories to
 * load "the actual approved message" for a preservation flow; never
 * returns anything for a pending/rejected message, so a memory project can
 * never be started from one. Same anonymous-author guarantee as `getTile`:
 * an anonymous message's `authorId` is never looked up.
 */
export async function getPublicMessageById(id: string): Promise<PublicMessageDetail | null> {
  const message = await messageRepository.getById(id);
  if (
    !message ||
    message.status !== "approved" ||
    message.tileX === null ||
    message.tileY === null ||
    message.positionX === null ||
    message.positionY === null ||
    message.rotation === null
  ) {
    return null;
  }

  const author: BoardTileAuthor | null = message.isAnonymous
    ? null
    : {
        displayName: message.authorName,
        image: (await userRepository.getById(message.authorId))?.image ?? null,
      };

  return {
    id: message.id,
    content: message.content,
    templateId: message.templateId,
    position: { x: message.positionX, y: message.positionY },
    rotation: message.rotation,
    language: message.language,
    createdAt: message.createdAt,
    author,
    likeCount: message.likeCount,
    tileX: message.tileX,
    tileY: message.tileY,
  };
}

/**
 * EPIC 021: board discovery's only read path — a keyword and/or date-range
 * search across every tile (unlike `getTile`, which is scoped to one).
 * Goes through the exact same `status = "approved"` gate and the same
 * "never fetch an anonymous message's author" guarantee as `getTile`
 * above; the only new thing is that `messageRepository.searchApproved`
 * isn't scoped to a single (tileX, tileY) pair. Refuses an all-empty
 * filter (`{}`) rather than silently returning "the most recent N
 * approved messages" — this stays a discovery/filter feature, never a
 * second, unbounded way to browse the whole board outside the tile
 * system (see CLAUDE.md's "Scaling principles": the board is
 * spatially-partitioned by tile, never "load everything").
 */
export async function searchPublicMessages(filters: BoardSearchFilters): Promise<PublicMessageDetail[]> {
  if (!filters.keyword && !filters.from && !filters.to) return [];

  const matches = await messageRepository.searchApproved({ ...filters, limit: SEARCH_RESULT_LIMIT });
  const placed = matches.filter(
    (message): message is typeof message & { tileX: number; tileY: number; positionX: number; positionY: number; rotation: number } =>
      message.tileX !== null && message.tileY !== null && message.positionX !== null && message.positionY !== null && message.rotation !== null
  );

  const namedAuthorIds = [...new Set(placed.filter((m) => !m.isAnonymous).map((m) => m.authorId))];
  const authors = namedAuthorIds.length > 0 ? await userRepository.getByIds(namedAuthorIds) : [];
  const imageByUserId = new Map(authors.map((author) => [author.id, author.image]));

  return placed.map((message) => {
    const author: BoardTileAuthor | null = message.isAnonymous
      ? null
      : { displayName: message.authorName, image: imageByUserId.get(message.authorId) ?? null };

    return {
      id: message.id,
      content: message.content,
      templateId: message.templateId,
      position: { x: message.positionX, y: message.positionY },
      rotation: message.rotation,
      language: message.language,
      createdAt: message.createdAt,
      author,
      likeCount: message.likeCount,
      tileX: message.tileX,
      tileY: message.tileY,
    };
  });
}
