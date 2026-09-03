import { and, desc, eq, gte, lte, notInArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { messageLikes, messages } from "@/lib/db/schema";
import { computePlacement, tileForSequence, type OccupantFootprint } from "@/features/board/lib/placement";
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
   * Approved messages placed in one tile — the public board's only read
   * path. `range` is the time-exploration foundation from EPIC 004: no UI
   * exposes it yet, but the query layer already supports narrowing to a
   * `createdAt` window so a future "This Week" / "This Month" / a specific
   * year can be added without touching this method's callers.
   */
  listApprovedByTile(tileX: number, tileY: number, range?: { from?: Date; to?: Date }): Promise<Message[]>;
  approve(id: string, moderatorId: string): Promise<Message | null>;
  reject(id: string, moderatorId: string): Promise<Message | null>;
  /**
   * Pulls a currently-approved message off the public board without
   * deleting it — an atomic conditional UPDATE (same pattern as
   * approve/reject: `id` + `status = "approved"` in the WHERE clause is
   * the actual security/state boundary, not just a check in the calling
   * Server Function). Deliberately does NOT touch tileX/tileY/positionX/
   * positionY/rotation — those stay exactly as they were, so restore()
   * can bring the same message back to the same spot.
   */
  archive(id: string, moderatorId: string): Promise<Message | null>;
  /**
   * The inverse of archive() — flips status back to "approved" without
   * ever recomputing placement (no new sequence number, no call to
   * computePlacement). Same message, same id, same coordinates: never a
   * new row, never a duplicate.
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
   * admin approves it afterward — never a shortcut around that.
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
   */
  listByAuthor(authorId: string, options?: { range?: { from?: Date; to?: Date }; limit?: number }): Promise<Message[]>;
  /**
   * One author's PUBLIC messages only — filtered in the query itself
   * (`status = "approved" AND is_anonymous = false`), never by fetching
   * everything and hiding rows in the client. The only read path for the
   * personal wall (/me, /u/[publicId]) — see "Public personal wall
   * architecture" in CLAUDE.md. Oldest first, so a wall reads like a
   * timeline and the wall-curation algorithm samples a stable order.
   */
  listPublicByAuthor(authorId: string, options?: { range?: { from?: Date; to?: Date }; limit?: number }): Promise<Message[]>;
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
    aiModerationStatus: row.aiModerationStatus,
    aiModerationProvider: row.aiModerationProvider,
    aiModerationCategories: row.aiModerationCategories ?? [],
    aiModerationReason: row.aiModerationReason,
    aiModerationConfidence: row.aiModerationConfidence,
    aiModeratedAt: row.aiModeratedAt?.toISOString() ?? null,
    consentAccepted: row.consentAccepted,
    consentVersion: row.consentVersion,
    consentAcceptedAt: row.consentAcceptedAt?.toISOString() ?? null,
  };
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

  async approve(id: string, moderatorId: string): Promise<Message | null> {
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
    // Real siblings already placed in the destination tile — collision
    // checked against, not ignored, so a crowded tile degrades to the
    // least-overlapping spot instead of stacking blindly. See
    // placement.ts's module doc for why this was missing before.
    const tileOccupants = await this.listApprovedByTile(tileX, tileY);
    const occupants: OccupantFootprint[] = tileOccupants
      .filter((m) => m.positionX !== null && m.positionY !== null && m.rotation !== null)
      .map((m) => ({
        positionX: m.positionX!,
        positionY: m.positionY!,
        rotation: m.rotation!,
        ...estimateNoteFootprint(m.templateId, m.content),
      }));
    const footprint = estimateNoteFootprint(current.templateId, current.content);
    const placement = computePlacement(sequence, id, footprint, occupants);
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
        updatedAt: now,
      })
      .where(and(eq(messages.id, id), eq(messages.status, "pending")))
      .returning();

    return row ? toMessage(row) : null;
  }

  async reject(id: string, moderatorId: string): Promise<Message | null> {
    const db = getDb();
    const now = new Date();
    const [row] = await db
      .update(messages)
      .set({ status: "rejected", moderatedAt: now, moderatedBy: moderatorId, updatedAt: now })
      .where(and(eq(messages.id, id), eq(messages.status, "pending")))
      .returning();
    return row ? toMessage(row) : null;
  }

  async archive(id: string, moderatorId: string): Promise<Message | null> {
    const db = getDb();
    const now = new Date();
    const [row] = await db
      .update(messages)
      .set({ status: "archived", moderatedAt: now, moderatedBy: moderatorId, updatedAt: now })
      .where(and(eq(messages.id, id), eq(messages.status, "approved")))
      .returning();
    return row ? toMessage(row) : null;
  }

  async restore(id: string, moderatorId: string): Promise<Message | null> {
    const db = getDb();
    const now = new Date();
    const [row] = await db
      .update(messages)
      .set({ status: "approved", moderatedAt: now, moderatedBy: moderatorId, updatedAt: now })
      .where(and(eq(messages.id, id), eq(messages.status, "archived")))
      .returning();
    return row ? toMessage(row) : null;
  }

  async reconsider(id: string, moderatorId: string): Promise<Message | null> {
    const db = getDb();
    const now = new Date();
    const [row] = await db
      .update(messages)
      .set({ status: "pending", moderatedAt: now, moderatedBy: moderatorId, updatedAt: now })
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

  async listByAuthor(authorId: string, options?: { range?: { from?: Date; to?: Date }; limit?: number }): Promise<Message[]> {
    const db = getDb();
    const conditions = [eq(messages.authorId, authorId)];
    if (options?.range?.from) conditions.push(gte(messages.createdAt, options.range.from));
    if (options?.range?.to) conditions.push(lte(messages.createdAt, options.range.to));

    const rows = await db
      .select()
      .from(messages)
      .where(and(...conditions))
      .orderBy(desc(messages.createdAt))
      .limit(options?.limit ?? 1000);
    return rows.map(toMessage);
  }

  async listPublicByAuthor(authorId: string, options?: { range?: { from?: Date; to?: Date }; limit?: number }): Promise<Message[]> {
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
      .limit(options?.limit ?? 1000);
    return rows.map(toMessage);
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
