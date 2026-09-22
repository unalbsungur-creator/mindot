import { and, desc, eq, gte, ilike, inArray, lte, notInArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { messageLikes, messages } from "@/lib/db/schema";
import { computePlacement, findEmptyTile, hasCollision, neighborTiles, tileForSequence, type NoteFootprint, type OccupantFootprint } from "@/features/board/lib/placement";
import { estimateNoteFootprint } from "@/features/notes/lib/footprint";
import { CONTENT_CONSENT_VERSION } from "./consent";
import type { Message, NewMessageInput } from "./types";

/**
 * Repository abstraction over message storage — same shape as EPIC 002's
 * in-memory version, extended with the moderation and tile-query methods
 * this EPIC needs. Every write goes through here; nothing outside this
 * file talks to the `messages` table directly.
 */
export interface MessageRepository {
  create(input: NewMessageInput): Promise<Message>;
  getById(id: string): Promise<Message | null>;
  /** Pending messages, oldest first (first submitted, first reviewed). */
  listPending(): Promise<Message[]>;
  /**
   * EPIC: Yönetim Panelinde Statü Grupları — replaces the old combined
   * `listReviewed` (approved+rejected together) with one method per
   * category, matching the admin page's four distinct sections. Most
   * recently moderated first, like the old method.
   */
  listApproved(limit?: number): Promise<Message[]>;
  listRejected(limit?: number): Promise<Message[]>;
  /**
   * EPIC: Published Note Edit + Re-approval — every approved message with
   * a pending revision, oldest submission first (same "first submitted,
   * first reviewed" convention as `listPending`). Deliberately its own
   * query rather than filtering `listApproved`'s result in JS: that method
   * caps at 50 most-recently-*moderated* rows, so a revision on an older
   * approved message could otherwise fall outside the window an admin
   * actually sees — this guarantees a pending revision is never missed.
   */
  listPendingRevisions(): Promise<Message[]>;
  /**
   * Approved messages placed in one tile — the public board's only read
   * path. `range` is the time-exploration foundation from EPIC 004: no UI
   * exposes it yet, but the query layer already supports narrowing to a
   * `createdAt` window so a future "This Week" / "This Month" / a specific
   * year can be added without touching this method's callers.
   */
  listApprovedByTile(tileX: number, tileY: number, range?: { from?: Date; to?: Date }): Promise<Message[]>;
  /**
   * EPIC 021: board discovery — approved messages matching an optional
   * keyword (case-insensitive substring over `content`) and/or an optional
   * `createdAt` range, across every tile (not scoped to one, unlike
   * `listApprovedByTile`). `status = "approved"` plus the date range reuses
   * the existing `messages_status_created_idx (status, created_at)`
   * exactly as `listApprovedByTile` already does; the keyword match itself
   * is a plain `ILIKE`, which can't use that (or any) index for an
   * infix/substring pattern — acceptable at this app's current message
   * volume (see CLAUDE.md's own "small volume in practice" precedent for
   * admin-facing queries; this is public-facing but the same reasoning
   * applies at today's scale). A `pg_trgm` GIN index would be the correct
   * follow-up if keyword search volume/row count ever became a real
   * concern — deliberately not added now, since it isn't needed yet.
   * `limit` bounds the result set the same way every other "small,
   * capped, no pagination" list in this codebase already does (see
   * `getPrivateArchive`/`getMemoryLibrary`).
   */
  /**
   * `templateIds` — EPIC "Paylaşılan Kartlarda Gelişmiş Filtreleme"'s
   * category filter, already resolved to a concrete id list by the caller
   * (`features/notes/config/templates.ts`'s `templateIdsForCategory`, via
   * `features/board/repository.ts`) — this layer only ever sees plain
   * template ids, never `NoteTemplateCategory` itself, so the messages
   * feature stays decoupled from the notes feature's own category concept.
   * `undefined`/empty applies no template restriction, same as every other
   * optional filter here.
   */
  /**
   * EPIC — Duvar Filtreleme: Dil Tercihi — `languages`, resolved by the
   * caller (`features/board/repository.ts`) to a one-element array from a
   * single `Locale`, filters on `messages.language` directly — the exact
   * value stored at submission time, never a content-detection heuristic.
   * Same "undefined/empty applies no restriction" convention as
   * `templateIds`.
   */
  searchApproved(options: {
    keyword?: string;
    from?: Date;
    to?: Date;
    templateIds?: string[];
    languages?: string[];
    limit: number;
  }): Promise<Message[]>;
  /**
   * EPIC 014: `reason` is the acting admin's own optional written
   * justification — persisted in the same atomic conditional UPDATE as
   * the status transition itself, alongside moderatedAt/moderatedBy (no
   * separate transaction needed; it's one UPDATE statement already).
   */
  approve(id: string, moderatorId: string, reason?: string | null): Promise<Message | null>;
  reject(id: string, moderatorId: string, reason?: string | null): Promise<Message | null>;
  /**
   * Pulls a currently-approved message off the public board without
   * deleting it — an atomic conditional UPDATE (same pattern as
   * approve/reject: `id` + `status = "approved"` in the WHERE clause is
   * the actual security/state boundary, not just a check in the calling
   * Server Function). Deliberately does NOT touch tileX/tileY/positionX/
   * positionY/rotation — those stay exactly as they were, so restore()
   * can bring the same message back to the same spot.
   */
  archive(id: string, moderatorId: string, reason?: string | null): Promise<Message | null>;
  /**
   * The inverse of archive() — flips status back to "approved" without
   * ever recomputing placement (no new sequence number, no call to
   * computePlacement). Same message, same id, same coordinates: never a
   * new row, never a duplicate. EPIC 014: no `reason` parameter — this is
   * an undo of a prior decision, not a new one, so `moderationReason` is
   * cleared to null rather than carrying the archived-state's stale
   * reason forward onto the restored message.
   */
  restore(id: string, moderatorId: string): Promise<Message | null>;
  /** Archived messages, most recently archived first — the admin-only "Archived" view. */
  listArchived(): Promise<Message[]>;
  /**
   * EPIC: Statüye Göre Yönetim Aksiyonları — a rejected message's "geri
   * incelemeye al" action: rejected → pending, same atomic conditional
   * UPDATE pattern as approve/reject/archive/restore. A message reconsidered
   * this way has no placement yet (it was never approved), so it goes
   * through the normal approve() → computePlacement() path again if an
   * admin approves it afterward — never a shortcut around that. EPIC 014:
   * no `reason` parameter, same "this undoes a decision, it isn't one"
   * reasoning as restore() — `moderationReason` is cleared to null.
   */
  reconsider(id: string, moderatorId: string): Promise<Message | null>;
  /**
   * EPIC: Message Like System. Records one like from a real identity —
   * exactly one of `userId`/`anonymousId` should be set (see
   * message_likes' own doc comment in schema.ts for what each means and
   * its honesty limits). Idempotent: liking an already-liked message
   * returns `alreadyLiked: true` without incrementing again. Refuses
   * (`ok: false`) for anything that isn't currently `status = "approved"`
   * — archived/pending/rejected messages can never gain a like.
   */
  like(messageId: string, identity: { userId?: string; anonymousId?: string }): Promise<{ ok: boolean; likeCount: number; alreadyLiked: boolean }>;
  /** Total currently-approved (live, unarchived) messages — a single aggregate query, the homepage's active-message counter. */
  countApproved(): Promise<number>;
  /** EPIC 022: total currently-pending messages — a single aggregate query, AdminNav's Moderation badge. */
  countPending(): Promise<number>;
  /**
   * EPIC 018: how many messages this author has created in the last
   * `windowMinutes` — the real data `submitMessage`'s rate-limit check
   * reads server-side, before any new row is inserted. Uses the existing
   * `messages_author_created_idx` (authorId, createdAt); no new index
   * needed for this query shape.
   */
  countRecentByAuthor(authorId: string, windowMinutes: number): Promise<number>;
  /**
   * Approved messages ordered by like count (ties broken by createdAt,
   * oldest first, for determinism), excluding the given ids. Deliberately
   * does NOT filter to `likeCount > 0` — with too few liked messages this
   * naturally falls through to "any other approved messages," which is
   * exactly the homepage's documented fallback behavior, for free.
   */
  listTopLikedApproved(excludeIds: string[], limit: number): Promise<Message[]>;
  /**
   * One author's own messages, every status — the private archive's only
   * read path (EPIC 009). Never filtered by anonymity: a message stays in
   * the owner's own archive regardless of how it's shown publicly. Newest
   * first, like a personal inbox of what you've submitted.
   *
   * EPIC 024: `offset` is additive and optional (defaults to 0) — every
   * existing caller that only passes `range`/`limit` is unaffected.
   *
   * `keyword` (own-archive search): same `ilike` + `turkishSearchKeyword`
   * content match `searchApproved` already uses for the public board
   * search, scoped here by the mandatory `authorId` equality condition —
   * never a caller-supplied identity, so a keyword can only ever match
   * the authenticated caller's own messages. Optional and additive, same
   * as `range`/`limit`/`offset`.
   */
  listByAuthor(
    authorId: string,
    options?: { range?: { from?: Date; to?: Date }; limit?: number; offset?: number; keyword?: string }
  ): Promise<Message[]>;
  /**
   * One author's PUBLIC messages only — filtered in the query itself
   * (`status = "approved" AND is_anonymous = false`), never by fetching
   * everything and hiding rows in the client. The only read path for the
   * personal wall (/me, /u/[publicId]) — see "Public personal wall
   * architecture" in CLAUDE.md. Oldest first, so a wall reads like a
   * timeline and the wall-curation algorithm samples a stable order.
   *
   * EPIC 024: `offset` is additive and optional (defaults to 0), same as
   * `listByAuthor` above.
   */
  listPublicByAuthor(
    authorId: string,
    options?: { range?: { from?: Date; to?: Date }; limit?: number; offset?: number }
  ): Promise<Message[]>;
  /**
   * EPIC 024: total messages matching exactly `listByAuthor`'s own filter
   * (author + optional range, every status) with no `limit`/`offset` —
   * the private archive's pagination `total`. Mirrors `listByAuthor`'s
   * condition-building so the two can never silently drift apart —
   * including the same optional `keyword` filter, so a search's `total`
   * (and the pagination it drives) always matches what `listByAuthor`
   * actually returns for that same keyword.
   */
  countByAuthorInRange(authorId: string, range?: { from?: Date; to?: Date }, keyword?: string): Promise<number>;
  /**
   * EPIC 024: total messages matching exactly `listPublicByAuthor`'s own
   * filter (author + approved + named + wall-visible + optional range) —
   * the public wall's pagination `total`.
   */
  countPublicByAuthorInRange(authorId: string, range?: { from?: Date; to?: Date }): Promise<number>;
  /**
   * EPIC 011: toggles one message's personal-wall curation flag. An atomic
   * conditional UPDATE — `authorId`, `status = "approved"`, and
   * `isAnonymous = false` are all part of the WHERE clause, so this is the
   * actual security/eligibility boundary (same pattern as `approve`/
   * `reject`/access-code `redeem`), not just a check in the calling Server
   * Function. Returns null if the caller isn't the owner, the message
   * doesn't exist, isn't approved, or is anonymous.
   */
  setShowOnPersonalWall(id: string, authorId: string, value: boolean): Promise<Message | null>;
  /** EPIC 011: grouped counts for one author's own activity summary — a single aggregate query, never a fetch-everything-and-count-in-JS. */
  countByAuthor(
    authorId: string
  ): Promise<{ total: number; pending: number; approved: number; rejected: number; archived: number }>;
  /**
   * EPIC 049: repositions one already-approved message's board coordinate
   * in place — an atomic conditional UPDATE (`id` + `status = "approved"`
   * in the WHERE clause, same boundary shape as every other write in this
   * file) that touches *only* `positionX`/`positionY`. Never `tileX`/
   * `tileY` (the message stays in the same tile it was already routed to —
   * this is a within-tile repair, not a re-route) and never `rotation`
   * (the repair tool that calls this always re-solves collision-freedom at
   * the message's existing rotation, so its visual character is
   * unchanged) — and obviously never content/author/likeCount/moderation
   * fields, which this method doesn't even accept as parameters. See
   * `features/board/lib/repairCollisions.ts` for the one caller and the
   * collision-detection logic that decides when this is actually needed.
   */
  repositionPlacement(id: string, positionX: number, positionY: number): Promise<Message | null>;
  /**
   * EPIC 049: the rare escape hatch `repositionPlacement` deliberately
   * doesn't provide — moving a message to a *different* tile, only ever
   * used when its original tile is genuinely over the capacity a
   * within-tile repair can guarantee collision-freedom for (see
   * `src/lib/db/repairPlacements.ts` and `findEmptyTile` in
   * `features/board/lib/placement.ts`). Same atomic-conditional-UPDATE
   * boundary (`id` + `status = "approved"`) and same narrow field set as
   * `repositionPlacement` otherwise — content/author/fontFamily/
   * templateId/likeCount/moderation fields are untouched, `rotation` is
   * untouched (the target tile is always empty, so the message's existing
   * rotation is already collision-free there by construction).
   */
  migrateToEmptyTile(id: string, tileX: number, tileY: number, positionX: number, positionY: number): Promise<Message | null>;
  /**
   * EPIC: Published Note Edit + Re-approval — records a proposed content
   * change on an already-approved message without touching the live
   * `content` at all. The real ownership/eligibility boundary is the WHERE
   * clause: `id` + `authorId` + `status = "approved"` + `pendingContent IS
   * NULL`, the same atomic-conditional-UPDATE shape as `setShowOnPersonalWall`
   * above — a null result covers "not yours," "doesn't exist," "not
   * approved," and "a revision is already pending" alike. Also clears any
   * leftover `revisionRejectionReason` from a previous rejected attempt, so
   * a fresh submission never shows a stale rejection message.
   */
  submitRevision(id: string, authorId: string, content: string): Promise<Message | null>;
  /**
   * Applies a pending revision: `content` becomes `pendingContent`, then
   * every revision-tracking field is cleared in the same atomic UPDATE —
   * `status` never changes (it was already "approved"), so this is the
   * entire boundary between "pending revision" and "published" again.
   * `WHERE id + pendingContent IS NOT NULL` mirrors `approve()`'s own
   * `WHERE status = "pending"` shape exactly.
   */
  approveRevision(id: string, moderatorId: string): Promise<Message | null>;
  /**
   * Discards a pending revision: `content` is never touched, only the
   * `pending*`/`revision*` bookkeeping fields — `revisionRejectionReason`
   * is the one field that survives (until the author's next submission
   * clears it), the same "latest reason, overwritten not appended" shape
   * `moderationReason` already uses.
   */
  rejectRevision(id: string, moderatorId: string, reason: string | null): Promise<Message | null>;
}

function toMessage(row: typeof messages.$inferSelect): Message {
  return {
    id: row.id,
    content: row.content,
    authorId: row.authorId,
    authorName: row.authorName,
    isAnonymous: row.isAnonymous,
    showOnPersonalWall: row.showOnPersonalWall,
    likeCount: row.likeCount,
    language: row.language,
    templateId: row.templateId,
    fontFamily: row.fontFamily as Message["fontFamily"],
    invitationId: row.invitationId,
    status: row.status,
    tileX: row.tileX,
    tileY: row.tileY,
    positionX: row.positionX,
    positionY: row.positionY,
    rotation: row.rotation,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    moderatedAt: row.moderatedAt?.toISOString() ?? null,
    moderatedBy: row.moderatedBy,
    moderationReason: row.moderationReason,
    aiModerationStatus: row.aiModerationStatus,
    aiModerationProvider: row.aiModerationProvider,
    aiModerationCategories: row.aiModerationCategories ?? [],
    aiModerationReason: row.aiModerationReason,
    aiModerationConfidence: row.aiModerationConfidence,
    aiModeratedAt: row.aiModeratedAt?.toISOString() ?? null,
    consentAccepted: row.consentAccepted,
    consentVersion: row.consentVersion,
    consentAcceptedAt: row.consentAcceptedAt?.toISOString() ?? null,
    pendingContent: row.pendingContent,
    revisionSubmittedAt: row.revisionSubmittedAt?.toISOString() ?? null,
    revisionReviewedAt: row.revisionReviewedAt?.toISOString() ?? null,
    revisionReviewedBy: row.revisionReviewedBy,
    revisionRejectionReason: row.revisionRejectionReason,
  };
}

/**
 * EPIC 053: Turkish-aware case folding for search keywords only — confirmed,
 * reproducible bug found in final-release QA: Postgres's `ILIKE` case-folds
 * using the database's own (non-Turkish) locale, so a real user search like
 * "ASLANIM" (a very ordinary Caps-Lock/Turkish-keyboard uppercase input)
 * never matched stored content's "aslanım" — standard case folding maps
 * ASCII "I" to dotted "i", never to Turkish's dotless "ı", and Postgres has
 * no Turkish-specific collation configured. Confirmed via manual testing
 * that ILIKE already case-folds every other character correctly on both
 * sides (a plain-ASCII query like "SLAN" matched fine) — only the Turkish
 * İ/I pair needed correcting, and only on the keyword side, so this stays a
 * narrow, targeted fix rather than a new normalization layer: it never
 * touches the `content` column, the query shape, or any index.
 */
function turkishSearchKeyword(keyword: string): string {
  return keyword.replace(/İ/g, "i").replace(/I/g, "ı");
}

/** Atomically claims the next placement slot from the Postgres sequence. */
async function nextPlacementSequence(db: ReturnType<typeof getDb>): Promise<number> {
  const [row] = await db.execute<{ seq: string }>(sql`select nextval('message_placement_seq') as seq`);
  return Number(row.seq);
}

class DrizzleMessageRepository implements MessageRepository {
  async create(input: NewMessageInput): Promise<Message> {
    const db = getDb();
    const now = new Date();
    // The actual audit boundary, not just a pass-through of the caller's
    // flag: consent only ever counts as accepted here if BOTH the caller
    // says so AND the version matches this build's current consent text
    // exactly — same "recompute the real condition at the write boundary"
    // principle as approve()/redeem() elsewhere in this codebase, so a
    // future caller that skips or weakens submitMessage's own check still
    // can't produce a false "consent_accepted=true" audit row. The
    // timestamp is this method's own server-side `now`, never anything the
    // client could have supplied.
    const consentIsValid = input.consentAccepted && input.consentVersion === CONTENT_CONSENT_VERSION;
    const [row] = await db
      .insert(messages)
      .values({
        id: crypto.randomUUID(),
        ...input,
        status: "pending",
        createdAt: now,
        updatedAt: now,
        aiModeratedAt: input.aiModeratedAt ? new Date(input.aiModeratedAt) : null,
        consentAccepted: consentIsValid,
        consentVersion: consentIsValid ? CONTENT_CONSENT_VERSION : null,
        consentAcceptedAt: consentIsValid ? now : null,
      })
      .returning();
    return toMessage(row);
  }

  async getById(id: string): Promise<Message | null> {
    const db = getDb();
    const [row] = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
    return row ? toMessage(row) : null;
  }

  async listPending(): Promise<Message[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(messages)
      .where(eq(messages.status, "pending"))
      .orderBy(messages.createdAt);
    return rows.map(toMessage);
  }

  async listApproved(limit = 50): Promise<Message[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(messages)
      .where(eq(messages.status, "approved"))
      .orderBy(desc(messages.moderatedAt))
      .limit(limit);
    return rows.map(toMessage);
  }

  async listPendingRevisions(): Promise<Message[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(messages)
      .where(sql`${messages.pendingContent} is not null`)
      .orderBy(messages.revisionSubmittedAt);
    return rows.map(toMessage);
  }

  async listRejected(limit = 50): Promise<Message[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(messages)
      .where(eq(messages.status, "rejected"))
      .orderBy(desc(messages.moderatedAt))
      .limit(limit);
    return rows.map(toMessage);
  }

  async listApprovedByTile(tileX: number, tileY: number, range?: { from?: Date; to?: Date }): Promise<Message[]> {
    const db = getDb();
    const conditions = [eq(messages.status, "approved"), eq(messages.tileX, tileX), eq(messages.tileY, tileY)];
    if (range?.from) conditions.push(gte(messages.createdAt, range.from));
    if (range?.to) conditions.push(lte(messages.createdAt, range.to));

    const rows = await db
      .select()
      .from(messages)
      .where(and(...conditions))
      .orderBy(messages.createdAt);
    return rows.map(toMessage);
  }

  async searchApproved(options: {
    keyword?: string;
    from?: Date;
    to?: Date;
    templateIds?: string[];
    languages?: string[];
    limit: number;
  }): Promise<Message[]> {
    const db = getDb();
    const conditions = [eq(messages.status, "approved")];
    if (options.keyword) conditions.push(ilike(messages.content, `%${turkishSearchKeyword(options.keyword)}%`));
    if (options.from) conditions.push(gte(messages.createdAt, options.from));
    if (options.to) conditions.push(lte(messages.createdAt, options.to));
    if (options.templateIds && options.templateIds.length > 0) conditions.push(inArray(messages.templateId, options.templateIds));
    if (options.languages && options.languages.length > 0) conditions.push(inArray(messages.language, options.languages));

    const rows = await db
      .select()
      .from(messages)
      .where(and(...conditions))
      .orderBy(desc(messages.createdAt))
      .limit(options.limit);
    return rows.map(toMessage);
  }

  async approve(id: string, moderatorId: string, reason: string | null = null): Promise<Message | null> {
    const db = getDb();
    // content/templateId never change between "pending" and "approved", so
    // reading them here (ahead of the atomic conditional UPDATE below,
    // which remains the actual approval boundary) just to size this note's
    // placement footprint can't introduce a race that matters — a
    // concurrent double-approval still only ever succeeds once, via that
    // UPDATE's `WHERE status = 'pending'`.
    const current = await this.getById(id);
    if (!current) return null;

    const sequence = await nextPlacementSequence(db);
    const { tileX, tileY } = tileForSequence(sequence);
    const footprint = estimateNoteFootprint(current.templateId, current.content, current.fontFamily);

    // EPIC 049 (overflow hardening): the tile the sequence routes to is
    // the *preferred* spot, never the only one this note is allowed to
    // land on. This project's one absolute board rule — no two cards ever
    // overlap — outranks "stay in the sequence-assigned tile," so if that
    // tile is genuinely over capacity (every candidate
    // `resolveCollisionFreePosition` tries there still overlaps a real
    // occupant), the search widens: first to the 8 immediate neighbor
    // tiles (keeping the new card visually close to where it was meant to
    // land), then — only if every neighbor is *also* full — to a
    // guaranteed-empty tile via `findEmptyTile`. Every one of these is
    // bounded (at most 1 + 8 + 1 tile lookups) and deterministic, and the
    // very first tile still succeeds the overwhelming majority of the
    // time (this fallback exists for the rare case, not the common path),
    // so a healthy board pays for this with zero extra queries. Whichever
    // tile wins, the note ends up both real-position collision-free AND
    // visible — never silently hidden to avoid an overlap, and never left
    // overlapping to stay "in its tile."
    const initialOccupants = await this.occupantsOf(tileX, tileY);
    let placement = computePlacement(sequence, id, footprint, initialOccupants);

    if (this.overlapsAny(placement, footprint, initialOccupants)) {
      let resolved = false;
      for (const neighbor of neighborTiles(tileX, tileY)) {
        const neighborOccupants = await this.occupantsOf(neighbor.tileX, neighbor.tileY);
        const candidate = computePlacement(sequence, id, footprint, neighborOccupants);
        const candidatePlacement = { ...candidate, tileX: neighbor.tileX, tileY: neighbor.tileY };
        if (!this.overlapsAny(candidatePlacement, footprint, neighborOccupants)) {
          placement = candidatePlacement;
          resolved = true;
          break;
        }
      }

      if (!resolved) {
        const occupiedTileKeys = new Set(
          (await db.select({ tileX: messages.tileX, tileY: messages.tileY }).from(messages))
            .filter((t) => t.tileX !== null && t.tileY !== null)
            .map((t) => `${t.tileX},${t.tileY}`)
        );
        const emptyTile = findEmptyTile(occupiedTileKeys);
        const emptyPlacement = computePlacement(sequence, id, footprint, []);
        placement = { ...emptyPlacement, tileX: emptyTile.tileX, tileY: emptyTile.tileY };
      }
    }

    const now = new Date();

    const [row] = await db
      .update(messages)
      .set({
        status: "approved",
        tileX: placement.tileX,
        tileY: placement.tileY,
        positionX: placement.positionX,
        positionY: placement.positionY,
        rotation: placement.rotation,
        moderatedAt: now,
        moderatedBy: moderatorId,
        moderationReason: reason,
        updatedAt: now,
      })
      .where(and(eq(messages.id, id), eq(messages.status, "pending")))
      .returning();

    return row ? toMessage(row) : null;
  }

  /** Real siblings already placed in one tile, as plain footprints — the shape `resolveCollisionFreePosition`/`hasCollision` need. Shared by `approve()`'s primary attempt and its neighbor-tile overflow search so both read tile occupancy identically. */
  private async occupantsOf(tileX: number, tileY: number): Promise<OccupantFootprint[]> {
    const tileOccupants = await this.listApprovedByTile(tileX, tileY);
    return tileOccupants
      .filter((m) => m.positionX !== null && m.positionY !== null && m.rotation !== null)
      .map((m) => ({
        positionX: m.positionX!,
        positionY: m.positionY!,
        rotation: m.rotation!,
        ...estimateNoteFootprint(m.templateId, m.content, m.fontFamily),
      }));
  }

  /** Whether a candidate placement — at its own real footprint size — genuinely overlaps (real rotated+inflated box, same geometry `resolveCollisionFreePosition` itself trusts) any occupant already in that tile. */
  private overlapsAny(
    placement: { positionX: number; positionY: number; rotation: number },
    footprint: NoteFootprint,
    occupants: OccupantFootprint[]
  ): boolean {
    const candidate: OccupantFootprint = { positionX: placement.positionX, positionY: placement.positionY, rotation: placement.rotation, ...footprint };
    return occupants.some((occupant) => hasCollision(candidate, occupant));
  }

  async reject(id: string, moderatorId: string, reason: string | null = null): Promise<Message | null> {
    const db = getDb();
    const now = new Date();
    const [row] = await db
      .update(messages)
      .set({ status: "rejected", moderatedAt: now, moderatedBy: moderatorId, moderationReason: reason, updatedAt: now })
      .where(and(eq(messages.id, id), eq(messages.status, "pending")))
      .returning();
    return row ? toMessage(row) : null;
  }

  async archive(id: string, moderatorId: string, reason: string | null = null): Promise<Message | null> {
    const db = getDb();
    const now = new Date();
    const [row] = await db
      .update(messages)
      .set({ status: "archived", moderatedAt: now, moderatedBy: moderatorId, moderationReason: reason, updatedAt: now })
      .where(and(eq(messages.id, id), eq(messages.status, "approved")))
      .returning();
    return row ? toMessage(row) : null;
  }

  async restore(id: string, moderatorId: string): Promise<Message | null> {
    const db = getDb();
    const now = new Date();
    const [row] = await db
      .update(messages)
      .set({ status: "approved", moderatedAt: now, moderatedBy: moderatorId, moderationReason: null, updatedAt: now })
      .where(and(eq(messages.id, id), eq(messages.status, "archived")))
      .returning();
    return row ? toMessage(row) : null;
  }

  async repositionPlacement(id: string, positionX: number, positionY: number): Promise<Message | null> {
    const db = getDb();
    const [row] = await db
      .update(messages)
      .set({ positionX, positionY, updatedAt: new Date() })
      .where(and(eq(messages.id, id), eq(messages.status, "approved")))
      .returning();
    return row ? toMessage(row) : null;
  }

  async migrateToEmptyTile(id: string, tileX: number, tileY: number, positionX: number, positionY: number): Promise<Message | null> {
    const db = getDb();
    const [row] = await db
      .update(messages)
      .set({ tileX, tileY, positionX, positionY, updatedAt: new Date() })
      .where(and(eq(messages.id, id), eq(messages.status, "approved")))
      .returning();
    return row ? toMessage(row) : null;
  }

  async reconsider(id: string, moderatorId: string): Promise<Message | null> {
    const db = getDb();
    const now = new Date();
    const [row] = await db
      .update(messages)
      .set({ status: "pending", moderatedAt: now, moderatedBy: moderatorId, moderationReason: null, updatedAt: now })
      .where(and(eq(messages.id, id), eq(messages.status, "rejected")))
      .returning();
    return row ? toMessage(row) : null;
  }

  async listArchived(): Promise<Message[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(messages)
      .where(eq(messages.status, "archived"))
      .orderBy(desc(messages.moderatedAt));
    return rows.map(toMessage);
  }

  async like(
    messageId: string,
    identity: { userId?: string; anonymousId?: string }
  ): Promise<{ ok: boolean; likeCount: number; alreadyLiked: boolean }> {
    const db = getDb();

    return db.transaction(async (tx) => {
      const [message] = await tx
        .select({ status: messages.status, likeCount: messages.likeCount })
        .from(messages)
        .where(eq(messages.id, messageId))
        .limit(1);

      if (!message || message.status !== "approved") {
        return { ok: false, likeCount: message?.likeCount ?? 0, alreadyLiked: false };
      }

      // Postgres only matches ON CONFLICT against a *partial* unique index
      // (message_likes_message_user_idx / _anon_idx, both WHERE ... is not
      // null — see schema.ts) if the same predicate is repeated here as
      // `where`; the target columns alone aren't enough to infer it.
      const conflictTarget = identity.userId
        ? [messageLikes.messageId, messageLikes.userId]
        : [messageLikes.messageId, messageLikes.anonymousId];
      const conflictWhere = identity.userId
        ? sql`${messageLikes.userId} is not null`
        : sql`${messageLikes.anonymousId} is not null`;

      const [inserted] = await tx
        .insert(messageLikes)
        .values({
          id: crypto.randomUUID(),
          messageId,
          userId: identity.userId ?? null,
          anonymousId: identity.anonymousId ?? null,
        })
        .onConflictDoNothing({ target: conflictTarget, where: conflictWhere })
        .returning();

      if (!inserted) {
        return { ok: true, likeCount: message.likeCount, alreadyLiked: true };
      }

      const [updated] = await tx
        .update(messages)
        .set({ likeCount: sql`${messages.likeCount} + 1` })
        .where(eq(messages.id, messageId))
        .returning({ likeCount: messages.likeCount });

      return { ok: true, likeCount: updated?.likeCount ?? message.likeCount + 1, alreadyLiked: false };
    });
  }

  async countApproved(): Promise<number> {
    const db = getDb();
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(messages)
      .where(eq(messages.status, "approved"));
    return row?.count ?? 0;
  }

  async countPending(): Promise<number> {
    const db = getDb();
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(messages)
      .where(eq(messages.status, "pending"));
    return row?.count ?? 0;
  }

  async countRecentByAuthor(authorId: string, windowMinutes: number): Promise<number> {
    const db = getDb();
    const since = new Date(Date.now() - windowMinutes * 60_000);
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(messages)
      .where(and(eq(messages.authorId, authorId), gte(messages.createdAt, since)));
    return row?.count ?? 0;
  }

  async listTopLikedApproved(excludeIds: string[], limit: number): Promise<Message[]> {
    const db = getDb();
    const conditions = [eq(messages.status, "approved")];
    if (excludeIds.length > 0) conditions.push(notInArray(messages.id, excludeIds));

    const rows = await db
      .select()
      .from(messages)
      .where(and(...conditions))
      .orderBy(desc(messages.likeCount), messages.createdAt)
      .limit(limit);
    return rows.map(toMessage);
  }

  async listByAuthor(
    authorId: string,
    options?: { range?: { from?: Date; to?: Date }; limit?: number; offset?: number; keyword?: string }
  ): Promise<Message[]> {
    const db = getDb();
    const conditions = [eq(messages.authorId, authorId)];
    if (options?.range?.from) conditions.push(gte(messages.createdAt, options.range.from));
    if (options?.range?.to) conditions.push(lte(messages.createdAt, options.range.to));
    if (options?.keyword) conditions.push(ilike(messages.content, `%${turkishSearchKeyword(options.keyword)}%`));

    const rows = await db
      .select()
      .from(messages)
      .where(and(...conditions))
      .orderBy(desc(messages.createdAt))
      .limit(options?.limit ?? 1000)
      .offset(options?.offset ?? 0);
    return rows.map(toMessage);
  }

  async listPublicByAuthor(
    authorId: string,
    options?: { range?: { from?: Date; to?: Date }; limit?: number; offset?: number }
  ): Promise<Message[]> {
    const db = getDb();
    const conditions = [
      eq(messages.authorId, authorId),
      eq(messages.status, "approved"),
      eq(messages.isAnonymous, false),
      // EPIC 011: eligible (approved + named) doesn't mean shown — the
      // owner's separate personal-wall curation choice, see schema.ts.
      eq(messages.showOnPersonalWall, true),
    ];
    if (options?.range?.from) conditions.push(gte(messages.createdAt, options.range.from));
    if (options?.range?.to) conditions.push(lte(messages.createdAt, options.range.to));

    const rows = await db
      .select()
      .from(messages)
      .where(and(...conditions))
      .orderBy(messages.createdAt)
      .limit(options?.limit ?? 1000)
      .offset(options?.offset ?? 0);
    return rows.map(toMessage);
  }

  async countByAuthorInRange(authorId: string, range?: { from?: Date; to?: Date }, keyword?: string): Promise<number> {
    const db = getDb();
    const conditions = [eq(messages.authorId, authorId)];
    if (range?.from) conditions.push(gte(messages.createdAt, range.from));
    if (range?.to) conditions.push(lte(messages.createdAt, range.to));
    if (keyword) conditions.push(ilike(messages.content, `%${turkishSearchKeyword(keyword)}%`));

    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(messages)
      .where(and(...conditions));
    return row?.count ?? 0;
  }

  async countPublicByAuthorInRange(authorId: string, range?: { from?: Date; to?: Date }): Promise<number> {
    const db = getDb();
    const conditions = [
      eq(messages.authorId, authorId),
      eq(messages.status, "approved"),
      eq(messages.isAnonymous, false),
      eq(messages.showOnPersonalWall, true),
    ];
    if (range?.from) conditions.push(gte(messages.createdAt, range.from));
    if (range?.to) conditions.push(lte(messages.createdAt, range.to));

    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(messages)
      .where(and(...conditions));
    return row?.count ?? 0;
  }

  async setShowOnPersonalWall(id: string, authorId: string, value: boolean): Promise<Message | null> {
    const db = getDb();
    const [row] = await db
      .update(messages)
      .set({ showOnPersonalWall: value, updatedAt: new Date() })
      .where(
        and(
          eq(messages.id, id),
          eq(messages.authorId, authorId),
          eq(messages.status, "approved"),
          eq(messages.isAnonymous, false)
        )
      )
      .returning();
    return row ? toMessage(row) : null;
  }

  async submitRevision(id: string, authorId: string, content: string): Promise<Message | null> {
    const db = getDb();
    const now = new Date();
    const [row] = await db
      .update(messages)
      .set({ pendingContent: content, revisionSubmittedAt: now, revisionRejectionReason: null, updatedAt: now })
      .where(
        and(
          eq(messages.id, id),
          eq(messages.authorId, authorId),
          eq(messages.status, "approved"),
          sql`${messages.pendingContent} is null`
        )
      )
      .returning();
    return row ? toMessage(row) : null;
  }

  async approveRevision(id: string, moderatorId: string): Promise<Message | null> {
    const db = getDb();
    const now = new Date();
    const [row] = await db
      .update(messages)
      .set({
        content: sql`${messages.pendingContent}`,
        pendingContent: null,
        revisionSubmittedAt: null,
        revisionReviewedAt: now,
        revisionReviewedBy: moderatorId,
        revisionRejectionReason: null,
        updatedAt: now,
      })
      .where(and(eq(messages.id, id), sql`${messages.pendingContent} is not null`))
      .returning();
    return row ? toMessage(row) : null;
  }

  async rejectRevision(id: string, moderatorId: string, reason: string | null): Promise<Message | null> {
    const db = getDb();
    const now = new Date();
    const [row] = await db
      .update(messages)
      .set({
        pendingContent: null,
        revisionSubmittedAt: null,
        revisionReviewedAt: now,
        revisionReviewedBy: moderatorId,
        revisionRejectionReason: reason,
        updatedAt: now,
      })
      .where(and(eq(messages.id, id), sql`${messages.pendingContent} is not null`))
      .returning();
    return row ? toMessage(row) : null;
  }

  async countByAuthor(
    authorId: string
  ): Promise<{ total: number; pending: number; approved: number; rejected: number; archived: number }> {
    const db = getDb();
    const rows = await db
      .select({ status: messages.status, count: sql<number>`count(*)::int` })
      .from(messages)
      .where(eq(messages.authorId, authorId))
      .groupBy(messages.status);

    const counts = { total: 0, pending: 0, approved: 0, rejected: 0, archived: 0 };
    for (const row of rows) {
      counts[row.status] = row.count;
      counts.total += row.count;
    }
    return counts;
  }
}

export const messageRepository: MessageRepository = new DrizzleMessageRepository();
