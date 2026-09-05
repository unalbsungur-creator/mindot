import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { notifications } from "@/lib/db/schema";
import type { NewNotificationInput, Notification, NotificationPage } from "./types";

/**
 * Repository for the notifications feature — same "nothing outside this
 * file talks to the table directly" shape every other feature repository in
 * this codebase already follows (see messages/repository.ts's own doc
 * comment). Every query is scoped by `recipientUserId` in the SQL `WHERE`
 * itself, never filtered client-side or trusted from a caller-supplied id
 * that didn't come from `auth()` — see features/notifications/actions.ts.
 */
export interface NotificationRepository {
  create(input: NewNotificationInput): Promise<Notification>;
  /** One recipient's notifications, newest first, offset-paginated — the full-history page's only read path. */
  listForUser(userId: string, options: { limit: number; offset: number }): Promise<NotificationPage>;
  countUnreadForUser(userId: string): Promise<number>;
  /**
   * Atomic conditional `UPDATE ... WHERE id = ? AND recipient_user_id = ?`
   * — the real ownership boundary, same pattern as `messageRepository.
   * approve`/`setShowOnPersonalWall` elsewhere in this codebase. Returns
   * `null` for a notification that doesn't exist OR belongs to someone
   * else — the two cases are deliberately indistinguishable to the caller,
   * so this can never be used to probe whether a given id belongs to
   * another user. Idempotent: marking an already-read notification read
   * again still succeeds (readAt is preserved via COALESCE, not overwritten),
   * so a retried/double-clicked mutation is a safe no-op, not an error.
   */
  markAsRead(id: string, userId: string): Promise<Notification | null>;
  /** Marks every currently-unread notification for this user as read in one statement. Returns how many rows were updated (0 is a valid, non-error outcome). */
  markAllAsRead(userId: string): Promise<number>;
}

function toNotification(row: typeof notifications.$inferSelect): Notification {
  return {
    id: row.id,
    recipientUserId: row.recipientUserId,
    type: row.type,
    messageId: row.messageId,
    reportId: row.reportId,
    targetUrl: row.targetUrl,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

class DrizzleNotificationRepository implements NotificationRepository {
  async create(input: NewNotificationInput): Promise<Notification> {
    const db = getDb();
    const [row] = await db
      .insert(notifications)
      .values({
        id: crypto.randomUUID(),
        recipientUserId: input.recipientUserId,
        type: input.type,
        messageId: input.messageId ?? null,
        reportId: input.reportId ?? null,
        targetUrl: input.targetUrl ?? null,
      })
      .returning();
    return toNotification(row);
  }

  async listForUser(userId: string, options: { limit: number; offset: number }): Promise<NotificationPage> {
    const db = getDb();
    const [rows, countRows] = await Promise.all([
      db
        .select()
        .from(notifications)
        .where(eq(notifications.recipientUserId, userId))
        // EPIC 024: `createdAt` alone is not a safe sole ORDER BY key — two
        // rows can share the same timestamp (defaultNow() has finite
        // resolution, and this app can create several notifications in
        // quick succession, e.g. events.ts's rapid-fire calls). Without a
        // tiebreaker, Postgres does not guarantee the same relative order
        // for tied rows across repeated queries, which could make a row
        // appear on two pages or on none as `offset` pagination is
        // re-evaluated. `id` is a random UUID, not a creation-order proxy,
        // but it's stable and unique, so pairing it as the tiebreaker makes
        // the overall order deterministic and repeatable, closing the gap
        // without a schema change or a new index (ties are rare enough that
        // an in-memory sort of the already-narrow, already-limited result
        // set is enough).
        .orderBy(desc(notifications.createdAt), asc(notifications.id))
        .limit(options.limit)
        .offset(options.offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(notifications)
        .where(eq(notifications.recipientUserId, userId)),
    ]);
    return { items: rows.map(toNotification), total: countRows[0]?.count ?? 0 };
  }

  async countUnreadForUser(userId: string): Promise<number> {
    const db = getDb();
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.recipientUserId, userId), isNull(notifications.readAt)));
    return row?.count ?? 0;
  }

  async markAsRead(id: string, userId: string): Promise<Notification | null> {
    const db = getDb();
    const [row] = await db
      .update(notifications)
      .set({ readAt: sql`coalesce(${notifications.readAt}, now())` })
      .where(and(eq(notifications.id, id), eq(notifications.recipientUserId, userId)))
      .returning();
    return row ? toNotification(row) : null;
  }

  async markAllAsRead(userId: string): Promise<number> {
    const db = getDb();
    const rows = await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.recipientUserId, userId), isNull(notifications.readAt)))
      .returning({ id: notifications.id });
    return rows.length;
  }
}

export const notificationRepository: NotificationRepository = new DrizzleNotificationRepository();
