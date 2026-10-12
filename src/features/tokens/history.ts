import type { User } from "@/features/users/types";
import { formatLedgerCursor, parseLedgerCursor, type LedgerCursor } from "./lib/ledgerCursor";
import type { LedgerPage } from "./repository";
import type { TokenLedgerType } from "./types";

export const TOKEN_HISTORY_PAGE_SIZE = 50;

/**
 * A ledger account as the admin history shows it. A deleted account's
 * entries point at its tombstone row; that row's id and placeholder email
 * are never passed on — only that the account no longer exists.
 */
export type TokenHistoryAccount = { kind: "active"; name: string | null; email: string } | { kind: "deleted" };

export interface TokenHistoryRow {
  id: string;
  createdAt: string;
  type: TokenLedgerType;
  /** Signed: positive credits, negative spends. */
  amount: number;
  balanceAfter: number;
  user: TokenHistoryAccount;
  /** The admin behind a grant/adjustment; null for entries no admin created. */
  createdBy: TokenHistoryAccount | null;
  note: string | null;
  externalProvider: string | null;
  externalReference: string | null;
}

export type TokenHistoryResult =
  | { status: "unauthorized" }
  | { status: "ok"; rows: TokenHistoryRow[]; nextCursor: string | null };

export interface TokenHistoryDeps {
  /** The session's admin, or null for a non-admin or signed-out request. */
  requireAdmin: () => Promise<{ id: string } | null>;
  listLedger: (input: { limit: number; before: LedgerCursor | null }) => Promise<LedgerPage>;
  /** Must leave out deleted accounts — see userRepository.getActiveByIds. */
  getActiveUsersByIds: (ids: string[]) => Promise<User[]>;
}

/**
 * The admin token history: one page of the ledger, read-only. The admin
 * check comes first, so a non-admin request never reaches the ledger
 * query. An unrecognized `cursor` falls back to the first page.
 */
export async function loadTokenHistory(
  { cursor }: { cursor?: string | null },
  deps: TokenHistoryDeps
): Promise<TokenHistoryResult> {
  const admin = await deps.requireAdmin();
  if (!admin) return { status: "unauthorized" };

  const page = await deps.listLedger({ limit: TOKEN_HISTORY_PAGE_SIZE, before: parseLedgerCursor(cursor) });
  const accountIds = new Set<string>();
  for (const entry of page.entries) {
    accountIds.add(entry.userId);
    if (entry.createdBy) accountIds.add(entry.createdBy);
  }
  const activeUsers = new Map((await deps.getActiveUsersByIds([...accountIds])).map((user) => [user.id, user]));
  const account = (id: string): TokenHistoryAccount => {
    const user = activeUsers.get(id);
    return user ? { kind: "active", name: user.name, email: user.email } : { kind: "deleted" };
  };

  return {
    status: "ok",
    rows: page.entries.map((entry) => ({
      id: entry.id,
      createdAt: entry.createdAt,
      type: entry.type,
      amount: entry.amount,
      balanceAfter: entry.balanceAfter,
      user: account(entry.userId),
      createdBy: entry.createdBy ? account(entry.createdBy) : null,
      note: entry.note,
      externalProvider: entry.externalProvider,
      externalReference: entry.externalReference,
    })),
    nextCursor: page.nextCursor ? formatLedgerCursor(page.nextCursor) : null,
  };
}
