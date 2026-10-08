import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { mobileSessions, users, type mobilePlatformEnum } from "@/lib/db/schema";
import type { UserAccountStatus, UserRole } from "@/features/users/types";

/**
 * Native-app sessions (see the `mobileSessions` schema comment). Storage
 * only — every rule (what makes a refresh valid, reuse, who may revoke)
 * lives in mobileService.ts. Only SHA-256 hashes of refresh secrets ever
 * reach this module; a token or secret never does.
 *
 * Refresh rotation must read-then-write one row atomically, so it runs
 * through `transaction()`: the callback's reads are `FOR UPDATE` and its
 * writes commit together when the callback *returns* — including a
 * returned "reuse detected" result after revoking — and roll back only if
 * it throws.
 */
export type MobilePlatform = (typeof mobilePlatformEnum.enumValues)[number];

export interface MobileSessionRecord {
  id: string;
  userId: string;
  refreshTokenHash: string;
  previousRefreshTokenHash: string | null;
  platform: MobilePlatform;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewMobileSession {
  id: string;
  userId: string;
  refreshTokenHash: string;
  platform: MobilePlatform;
  expiresAt: Date;
  now: Date;
}

/** The minimum an authenticated mobile request needs to know about its account. */
export interface ActiveMobileSession {
  sessionId: string;
  userId: string;
  platform: MobilePlatform;
  role: UserRole;
  status: UserAccountStatus;
}

/** The row-locked operations available inside `transaction()`. */
export interface MobileSessionTransaction {
  /** `SELECT ... FOR UPDATE` — holds the row until the transaction ends. */
  getByIdForUpdate(id: string): Promise<MobileSessionRecord | null>;
  rotate(id: string, update: { refreshTokenHash: string; previousRefreshTokenHash: string; expiresAt: Date; now: Date }): Promise<void>;
  /** Sets `revoked_at` unless already set. */
  revoke(id: string, now: Date): Promise<void>;
}

export interface MobileSessionRepository {
  create(session: NewMobileSession): Promise<void>;
  transaction<T>(work: (tx: MobileSessionTransaction) => Promise<T>): Promise<T>;
  /**
   * The session `id` if it belongs to `userId`, is neither revoked nor
   * expired at `now`, and its account still exists (not deleted) — in one
   * query. `null` otherwise, without saying which condition failed.
   */
  getActiveWithUser(id: string, userId: string, now: Date): Promise<ActiveMobileSession | null>;
}

type Database = ReturnType<typeof getDb>;
type DbTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

function toRecord(row: typeof mobileSessions.$inferSelect): MobileSessionRecord {
  return {
    id: row.id,
    userId: row.userId,
    refreshTokenHash: row.refreshTokenHash,
    previousRefreshTokenHash: row.previousRefreshTokenHash,
    platform: row.platform,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

class DrizzleMobileSessionTransaction implements MobileSessionTransaction {
  constructor(private readonly tx: DbTransaction) {}

  async getByIdForUpdate(id: string): Promise<MobileSessionRecord | null> {
    const [row] = await this.tx.select().from(mobileSessions).where(eq(mobileSessions.id, id)).limit(1).for("update");
    return row ? toRecord(row) : null;
  }

  async rotate(
    id: string,
    update: { refreshTokenHash: string; previousRefreshTokenHash: string; expiresAt: Date; now: Date }
  ): Promise<void> {
    await this.tx
      .update(mobileSessions)
      .set({
        refreshTokenHash: update.refreshTokenHash,
        previousRefreshTokenHash: update.previousRefreshTokenHash,
        expiresAt: update.expiresAt,
        updatedAt: update.now,
      })
      .where(eq(mobileSessions.id, id));
  }

  async revoke(id: string, now: Date): Promise<void> {
    await this.tx
      .update(mobileSessions)
      .set({ revokedAt: now, updatedAt: now })
      .where(and(eq(mobileSessions.id, id), isNull(mobileSessions.revokedAt)));
  }
}

class DrizzleMobileSessionRepository implements MobileSessionRepository {
  async create(session: NewMobileSession): Promise<void> {
    const db = getDb();
    await db.insert(mobileSessions).values({
      id: session.id,
      userId: session.userId,
      refreshTokenHash: session.refreshTokenHash,
      platform: session.platform,
      expiresAt: session.expiresAt,
      createdAt: session.now,
      updatedAt: session.now,
    });
  }

  async transaction<T>(work: (tx: MobileSessionTransaction) => Promise<T>): Promise<T> {
    const db = getDb();
    return db.transaction((tx) => work(new DrizzleMobileSessionTransaction(tx)));
  }

  async getActiveWithUser(id: string, userId: string, now: Date): Promise<ActiveMobileSession | null> {
    const db = getDb();
    const [row] = await db
      .select({
        sessionId: mobileSessions.id,
        userId: users.id,
        platform: mobileSessions.platform,
        role: users.role,
        status: users.status,
      })
      .from(mobileSessions)
      .innerJoin(users, eq(users.id, mobileSessions.userId))
      .where(
        and(
          eq(mobileSessions.id, id),
          eq(mobileSessions.userId, userId),
          isNull(mobileSessions.revokedAt),
          gt(mobileSessions.expiresAt, now),
          isNull(users.deletedAt)
        )
      )
      .limit(1);
    return row ?? null;
  }
}

export const mobileSessionRepository: MobileSessionRepository = new DrizzleMobileSessionRepository();
