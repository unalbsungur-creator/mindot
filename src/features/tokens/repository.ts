import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { memoryPdfUnlocks, tokenLedger, tokenWallets, users } from "@/lib/db/schema";
import { memoryPdfUnlockRepository, toMemoryPdfUnlock } from "@/features/memories/repository";
import type { MemoryPdfUnlock } from "@/features/memories/types";
import type { LedgerCursor } from "./lib/ledgerCursor";
import type { TokenLedgerEntry, TokenWallet } from "./types";

/** Tokens one PDF unlock costs — 1 Memory Project = 1 Token, never charged per download. */
export const MEMORY_PDF_UNLOCK_COST = 1;

/**
 * Server-derived, never client input: a project can only ever be paid for
 * once (memory_pdf_unlocks.memory_project_id is unique), so its consume
 * entry's key is simply the project id — any retry or concurrent duplicate
 * of the same unlock collides on `token_ledger.idempotency_key` instead of
 * writing a second charge.
 */
export function memoryPdfUnlockIdempotencyKey(memoryProjectId: string): string {
  return `memory_pdf_unlock:${memoryProjectId}`;
}

/**
 * Server-composed, never taken verbatim from the client: the admin's id
 * namespaces the per-dialog request id the UI sends, so a retried submit of
 * the same grant collides on `token_ledger.idempotency_key` while no client
 * can ever produce a key outside its own admin_grant namespace.
 */
export function adminGrantIdempotencyKey(adminId: string, requestId: string): string {
  return `admin_grant:${adminId}:${requestId}`;
}

/** Tokens credited, once per account, for the first completed share on /share/[messageId]. */
export const FIRST_SHARE_REWARD_AMOUNT = 2;
export const FIRST_SHARE_REWARD_REFERENCE_TYPE = "first_share_reward";

/**
 * Random, never derived from the account: the key outlives an account
 * deletion unchanged (migration 0022), so it must carry no user id. "Once
 * per account" is enforced by the wallet lock and the partial unique index
 * token_ledger_first_share_reward_idx instead.
 */
export function firstShareRewardIdempotencyKey(): string {
  return `${FIRST_SHARE_REWARD_REFERENCE_TYPE}:${crypto.randomUUID()}`;
}

export type GrantFirstShareRewardResult =
  | { status: "granted"; entry: TokenLedgerEntry; balance: number }
  | { status: "already_rewarded" }
  // No such account, a deleted account's tombstone, or a suspended account.
  | { status: "ineligible" };

export type GrantByAdminResult =
  | { status: "granted" | "already_granted"; entry: TokenLedgerEntry; balance: number }
  // The idempotency key is already used by a different grant (other target
  // or amount) — never credited, never silently retried.
  | { status: "conflict" };

export type ConsumeForMemoryPdfUnlockResult =
  | { status: "newly_unlocked" | "already_unlocked"; unlock: MemoryPdfUnlock; balance: number }
  | { status: "insufficient_tokens"; balance: number }
  // A unique constraint fired but no unlock exists for the project (e.g. its
  // consume key is already used by an earlier, since-removed unlock) — never
  // charged, never silently retried.
  | { status: "conflict" };

export interface TokenRepository {
  /** Current balance; a user with no wallet row has 0. */
  getBalance(userId: string): Promise<number>;
  /** Balances for many users in one query; users without a wallet row are omitted (= 0). */
  getBalances(userIds: string[]): Promise<Map<string, number>>;
  getOrCreateWallet(userId: string): Promise<TokenWallet>;
  /**
   * Credits `amount` tokens to `userId` — wallet creation/lock, increment,
   * and the grant ledger entry all in one transaction. A repeated
   * `idempotencyKey` for the same grant returns `already_granted` and
   * credits nothing. Callers must have already verified the admin and the
   * target user; this only guarantees the money side.
   */
  grantByAdmin(input: {
    userId: string;
    amount: number;
    adminId: string;
    idempotencyKey: string;
    note: string | null;
  }): Promise<GrantByAdminResult>;
  /**
   * Spends MEMORY_PDF_UNLOCK_COST tokens and records the project's PDF
   * unlock — wallet decrement, consume ledger entry, and unlock row all in
   * one transaction. Returns `already_unlocked` (charging nothing) if the
   * project was unlocked before or concurrently. Callers must have already
   * verified ownership and eligibility; this only guarantees the money side.
   */
  consumeForMemoryPdfUnlock(input: { userId: string; memoryProjectId: string }): Promise<ConsumeForMemoryPdfUnlockResult>;
  /**
   * Credits FIRST_SHARE_REWARD_AMOUNT tokens once per account — the active
   * account check, wallet lock, "not rewarded yet" check, increment and
   * ledger entry all in one transaction. Returns `already_rewarded` for a
   * repeated or concurrent claim and `ineligible` (writing nothing, not even
   * a wallet row) for an unknown, deleted or suspended account. The caller
   * only supplies the session's user id; everything else is fixed here.
   */
  grantFirstShareReward(userId: string): Promise<GrantFirstShareRewardResult>;
  /**
   * Read-only: whether this account already has its first-share reward
   * entry. Display only (whether /share offers the reward) — never an
   * authorization check; grantFirstShareReward decides on its own.
   */
  hasFirstShareReward(userId: string): Promise<boolean>;
  /**
   * Read-only: one page of the whole ledger, newest first by (created_at,
   * id), for the admin history. `limit` is clamped to MAX_LEDGER_PAGE_SIZE;
   * `nextCursor` is null on the last page.
   */
  listLedger(input: { limit: number; before?: LedgerCursor | null }): Promise<LedgerPage>;
}

export const MAX_LEDGER_PAGE_SIZE = 100;

export interface LedgerPage {
  entries: TokenLedgerEntry[];
  nextCursor: LedgerCursor | null;
}

function toTokenWallet(row: typeof tokenWallets.$inferSelect): TokenWallet {
  return {
    userId: row.userId,
    balance: row.balance,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toTokenLedgerEntry(row: typeof tokenLedger.$inferSelect): TokenLedgerEntry {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

// drizzle-orm wraps driver errors in DrizzleQueryError, with postgres-js's
// own error (carrying the SQLSTATE `code`) as `cause`.
function isUniqueViolation(error: unknown): boolean {
  const codeOf = (value: unknown) =>
    typeof value === "object" && value !== null && "code" in value ? (value as { code: unknown }).code : undefined;
  return codeOf(error) === "23505" || (error instanceof Error && codeOf(error.cause) === "23505");
}

class DrizzleTokenRepository implements TokenRepository {
  async getBalance(userId: string): Promise<number> {
    const db = getDb();
    const [row] = await db
      .select({ balance: tokenWallets.balance })
      .from(tokenWallets)
      .where(eq(tokenWallets.userId, userId))
      .limit(1);
    return row?.balance ?? 0;
  }

  async getBalances(userIds: string[]): Promise<Map<string, number>> {
    if (userIds.length === 0) return new Map();
    const db = getDb();
    const rows = await db
      .select({ userId: tokenWallets.userId, balance: tokenWallets.balance })
      .from(tokenWallets)
      .where(inArray(tokenWallets.userId, userIds));
    return new Map(rows.map((row) => [row.userId, row.balance]));
  }

  async grantByAdmin({
    userId,
    amount,
    adminId,
    idempotencyKey,
    note,
  }: {
    userId: string;
    amount: number;
    adminId: string;
    idempotencyKey: string;
    note: string | null;
  }): Promise<GrantByAdminResult> {
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new RangeError("grant amount must be a positive integer");
    const db = getDb();
    try {
      return await db.transaction(async (tx) => {
        // Same lock order as consumeForMemoryPdfUnlock: ensure the wallet
        // row, then lock it, so this user's balance changes serialize.
        await tx.insert(tokenWallets).values({ userId }).onConflictDoNothing();
        await tx.select({ userId: tokenWallets.userId }).from(tokenWallets).where(eq(tokenWallets.userId, userId)).for("update");

        const [credited] = await tx
          .update(tokenWallets)
          .set({ balance: sql`${tokenWallets.balance} + ${amount}`, updatedAt: new Date() })
          .where(eq(tokenWallets.userId, userId))
          .returning({ balance: tokenWallets.balance });

        // A duplicate idempotency key fails this insert and rolls back the
        // increment above with it.
        const [entry] = await tx
          .insert(tokenLedger)
          .values({
            id: crypto.randomUUID(),
            userId,
            amount,
            type: "grant",
            balanceAfter: credited.balance,
            referenceType: "admin_grant",
            // Never the recipient's id: user_id already says who, and account
            // deletion re-points user_id to a tombstone but can't touch this
            // column (migration 0022), so an id here would outlive the account.
            referenceId: null,
            idempotencyKey,
            createdBy: adminId,
            note,
          })
          .returning();

        return { status: "granted" as const, entry: toTokenLedgerEntry(entry), balance: credited.balance };
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const [existing] = await db.select().from(tokenLedger).where(eq(tokenLedger.idempotencyKey, idempotencyKey)).limit(1);
      if (
        !existing ||
        existing.type !== "grant" ||
        existing.userId !== userId ||
        existing.amount !== amount ||
        existing.createdBy !== adminId
      ) {
        return { status: "conflict" };
      }
      return { status: "already_granted", entry: toTokenLedgerEntry(existing), balance: await this.getBalance(userId) };
    }
  }

  async getOrCreateWallet(userId: string): Promise<TokenWallet> {
    const db = getDb();
    await db.insert(tokenWallets).values({ userId }).onConflictDoNothing();
    const [row] = await db.select().from(tokenWallets).where(eq(tokenWallets.userId, userId)).limit(1);
    return toTokenWallet(row);
  }

  async consumeForMemoryPdfUnlock({
    userId,
    memoryProjectId,
  }: {
    userId: string;
    memoryProjectId: string;
  }): Promise<ConsumeForMemoryPdfUnlockResult> {
    const db = getDb();
    try {
      return await db.transaction(async (tx) => {
        // Ensure the wallet row exists, then lock it: every spend by this
        // user serializes here, so a concurrent unlock of the same project
        // waits and then sees this one's committed unlock below.
        await tx.insert(tokenWallets).values({ userId }).onConflictDoNothing();
        const [wallet] = await tx
          .select({ balance: tokenWallets.balance })
          .from(tokenWallets)
          .where(eq(tokenWallets.userId, userId))
          .for("update");

        const [existing] = await tx
          .select()
          .from(memoryPdfUnlocks)
          .where(eq(memoryPdfUnlocks.memoryProjectId, memoryProjectId))
          .limit(1);
        if (existing) {
          return { status: "already_unlocked" as const, unlock: toMemoryPdfUnlock(existing), balance: wallet.balance };
        }

        // Conditional decrement — the balance CHECK (>= 0) is only the backstop.
        const [debited] = await tx
          .update(tokenWallets)
          .set({ balance: sql`${tokenWallets.balance} - ${MEMORY_PDF_UNLOCK_COST}`, updatedAt: new Date() })
          .where(and(eq(tokenWallets.userId, userId), gte(tokenWallets.balance, MEMORY_PDF_UNLOCK_COST)))
          .returning({ balance: tokenWallets.balance });
        if (!debited) {
          return { status: "insufficient_tokens" as const, balance: wallet.balance };
        }

        const ledgerEntryId = crypto.randomUUID();
        await tx.insert(tokenLedger).values({
          id: ledgerEntryId,
          userId,
          amount: -MEMORY_PDF_UNLOCK_COST,
          type: "consume",
          balanceAfter: debited.balance,
          referenceType: "memory_project",
          referenceId: memoryProjectId,
          idempotencyKey: memoryPdfUnlockIdempotencyKey(memoryProjectId),
        });

        const [unlock] = await tx
          .insert(memoryPdfUnlocks)
          .values({ id: crypto.randomUUID(), memoryProjectId, userId, source: "token", ledgerEntryId })
          .returning();

        return { status: "newly_unlocked" as const, unlock: toMemoryPdfUnlock(unlock), balance: debited.balance };
      });
    } catch (error) {
      // The whole transaction rolled back, so nothing was charged. If the
      // collision was a concurrent unlock of this project, report it as
      // already unlocked; otherwise surface a conflict rather than retrying.
      if (!isUniqueViolation(error)) throw error;
      const unlock = await memoryPdfUnlockRepository.getByProjectId(memoryProjectId);
      if (!unlock) return { status: "conflict" };
      return { status: "already_unlocked", unlock, balance: await this.getBalance(userId) };
    }
  }

  async grantFirstShareReward(userId: string): Promise<GrantFirstShareRewardResult> {
    const db = getDb();
    try {
      return await db.transaction(async (tx) => {
        // A deliberate cross-table read (same precedent as deleteAccount):
        // lock the account first, in deleteAccount's own order (user, then
        // wallet), so a concurrent suspension or deletion either finishes
        // before this check or waits until the reward is committed.
        const [account] = await tx
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.id, userId), isNull(users.deletedAt), eq(users.status, "active")))
          .for("share");
        if (!account) return { status: "ineligible" as const };

        // Then the wallet: every balance change of this user serializes
        // here, so a concurrent claim waits and sees this one's entry below.
        await tx.insert(tokenWallets).values({ userId }).onConflictDoNothing();
        await tx.select({ userId: tokenWallets.userId }).from(tokenWallets).where(eq(tokenWallets.userId, userId)).for("update");

        const [previous] = await tx
          .select({ id: tokenLedger.id })
          .from(tokenLedger)
          .where(and(eq(tokenLedger.userId, userId), eq(tokenLedger.referenceType, FIRST_SHARE_REWARD_REFERENCE_TYPE)))
          .limit(1);
        if (previous) return { status: "already_rewarded" as const };

        const [credited] = await tx
          .update(tokenWallets)
          .set({ balance: sql`${tokenWallets.balance} + ${FIRST_SHARE_REWARD_AMOUNT}`, updatedAt: new Date() })
          .where(eq(tokenWallets.userId, userId))
          .returning({ balance: tokenWallets.balance });

        // Nothing personal beyond user_id, which account deletion re-points
        // to a tombstone: no reference id, no creator, no note, a random key.
        const [entry] = await tx
          .insert(tokenLedger)
          .values({
            id: crypto.randomUUID(),
            userId,
            amount: FIRST_SHARE_REWARD_AMOUNT,
            type: "grant",
            balanceAfter: credited.balance,
            referenceType: FIRST_SHARE_REWARD_REFERENCE_TYPE,
            referenceId: null,
            idempotencyKey: firstShareRewardIdempotencyKey(),
            createdBy: null,
            note: null,
          })
          .returning();

        return { status: "granted" as const, entry: toTokenLedgerEntry(entry), balance: credited.balance };
      });
    } catch (error) {
      // The partial unique index is the backstop behind the wallet lock: the
      // whole transaction rolled back, so nothing was credited twice.
      if (isUniqueViolation(error)) return { status: "already_rewarded" };
      throw error;
    }
  }

  async hasFirstShareReward(userId: string): Promise<boolean> {
    if (!userId) return false;
    const db = getDb();
    // Served by token_ledger_first_share_reward_idx (user_id, partial on this reference type).
    const [row] = await db
      .select({ id: tokenLedger.id })
      .from(tokenLedger)
      .where(and(eq(tokenLedger.userId, userId), eq(tokenLedger.referenceType, FIRST_SHARE_REWARD_REFERENCE_TYPE)))
      .limit(1);
    return row !== undefined;
  }

  async listLedger({ limit, before }: { limit: number; before?: LedgerCursor | null }): Promise<LedgerPage> {
    const pageSize = Math.min(Math.max(Math.trunc(limit) || 1, 1), MAX_LEDGER_PAGE_SIZE);
    // Exact microseconds (extract(epoch) is numeric since Postgres 14), so the
    // cursor compares on the stored value, not a millisecond-rounded Date.
    const createdAtMicros = sql<string>`(extract(epoch from ${tokenLedger.createdAt}) * 1000000)::bigint`;
    const db = getDb();
    const rows = await db
      .select({ entry: tokenLedger, cursorMicros: sql<string>`${createdAtMicros}::text` })
      .from(tokenLedger)
      .where(before ? sql`(${createdAtMicros}, ${tokenLedger.id}) < (${before.createdAtMicros}::bigint, ${before.id})` : undefined)
      .orderBy(desc(tokenLedger.createdAt), desc(tokenLedger.id))
      .limit(pageSize + 1);
    const page = rows.slice(0, pageSize);
    const last = page.at(-1);
    return {
      entries: page.map((row) => toTokenLedgerEntry(row.entry)),
      nextCursor: rows.length > pageSize && last ? { createdAtMicros: last.cursorMicros, id: last.entry.id } : null,
    };
  }
}

export const tokenRepository: TokenRepository = new DrizzleTokenRepository();
