import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { userBlocks, users } from "@/lib/db/schema";
import type { BlockedUserSummary } from "./types";

/**
 * Directional user blocks — see the `userBlocks` schema comment. Every
 * method is keyed by the *blocker*, which callers always take from the
 * session, never from client input; nothing here ever returns who has
 * blocked a given user, so no one can learn they were blocked.
 */
export interface BlockRepository {
  /** Idempotent: blocking someone already blocked reports `already-blocked`, never a second row. */
  block(blockerUserId: string, blockedUserId: string): Promise<"blocked" | "already-blocked">;
  unblock(blockerUserId: string, blockedUserId: string): Promise<"unblocked" | "not-blocked">;
  isBlocked(blockerUserId: string, blockedUserId: string): Promise<boolean>;
  /** The ids a viewer has blocked — small by nature, read once per request and passed to content queries as an exclusion list. */
  listBlockedIds(blockerUserId: string): Promise<string[]>;
  /** The viewer's own block list for managing it (/me) — newest first, live accounts only. */
  listBlockedUsers(blockerUserId: string): Promise<BlockedUserSummary[]>;
}

class DrizzleBlockRepository implements BlockRepository {
  async block(blockerUserId: string, blockedUserId: string): Promise<"blocked" | "already-blocked"> {
    const db = getDb();
    const inserted = await db
      .insert(userBlocks)
      .values({ blockerUserId, blockedUserId })
      .onConflictDoNothing()
      .returning({ blockedUserId: userBlocks.blockedUserId });
    return inserted.length > 0 ? "blocked" : "already-blocked";
  }

  async unblock(blockerUserId: string, blockedUserId: string): Promise<"unblocked" | "not-blocked"> {
    const db = getDb();
    const deleted = await db
      .delete(userBlocks)
      .where(and(eq(userBlocks.blockerUserId, blockerUserId), eq(userBlocks.blockedUserId, blockedUserId)))
      .returning({ blockedUserId: userBlocks.blockedUserId });
    return deleted.length > 0 ? "unblocked" : "not-blocked";
  }

  async isBlocked(blockerUserId: string, blockedUserId: string): Promise<boolean> {
    const db = getDb();
    const [row] = await db
      .select({ blockedUserId: userBlocks.blockedUserId })
      .from(userBlocks)
      .where(and(eq(userBlocks.blockerUserId, blockerUserId), eq(userBlocks.blockedUserId, blockedUserId)))
      .limit(1);
    return row !== undefined;
  }

  async listBlockedIds(blockerUserId: string): Promise<string[]> {
    const db = getDb();
    const rows = await db
      .select({ blockedUserId: userBlocks.blockedUserId })
      .from(userBlocks)
      .where(eq(userBlocks.blockerUserId, blockerUserId));
    return rows.map((row) => row.blockedUserId);
  }

  async listBlockedUsers(blockerUserId: string): Promise<BlockedUserSummary[]> {
    const db = getDb();
    const rows = await db
      .select({ publicId: users.publicId, name: users.name, image: users.image, blockedAt: userBlocks.createdAt })
      .from(userBlocks)
      .innerJoin(users, eq(users.id, userBlocks.blockedUserId))
      .where(and(eq(userBlocks.blockerUserId, blockerUserId), isNull(users.deletedAt)))
      .orderBy(desc(userBlocks.createdAt));
    return rows
      .filter((row): row is typeof row & { publicId: string } => row.publicId !== null)
      .map((row) => ({ publicId: row.publicId, displayName: row.name, image: row.image, blockedAt: row.blockedAt.toISOString() }));
  }
}

export const blockRepository: BlockRepository = new DrizzleBlockRepository();
