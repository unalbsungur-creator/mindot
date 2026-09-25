import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { memoryPdfUnlocks, tokenLedger, tokenWallets } from "@/lib/db/schema";
import { memoryPdfUnlockRepository, toMemoryPdfUnlock } from "@/features/memories/repository";
import type { MemoryPdfUnlock } from "@/features/memories/types";
import type { TokenWallet } from "./types";

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
  getOrCreateWallet(userId: string): Promise<TokenWallet>;
  /**
   * Spends MEMORY_PDF_UNLOCK_COST tokens and records the project's PDF
   * unlock — wallet decrement, consume ledger entry, and unlock row all in
   * one transaction. Returns `already_unlocked` (charging nothing) if the
   * project was unlocked before or concurrently. Callers must have already
   * verified ownership and eligibility; this only guarantees the money side.
   */
  consumeForMemoryPdfUnlock(input: { userId: string; memoryProjectId: string }): Promise<ConsumeForMemoryPdfUnlockResult>;
}

function toTokenWallet(row: typeof tokenWallets.$inferSelect): TokenWallet {
  return {
    userId: row.userId,
    balance: row.balance,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
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
}

export const tokenRepository: TokenRepository = new DrizzleTokenRepository();
