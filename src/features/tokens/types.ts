export type TokenLedgerType = "grant" | "purchase" | "subscription" | "consume" | "refund" | "adjustment";

/** A user's current token balance. No wallet row simply means a zero balance. */
export interface TokenWallet {
  userId: string;
  balance: number;
  createdAt: string;
  updatedAt: string;
}

/** One append-only token movement — the audit source of truth behind `TokenWallet.balance`. */
export interface TokenLedgerEntry {
  id: string;
  userId: string;
  amount: number;
  type: TokenLedgerType;
  balanceAfter: number;
  referenceType: string | null;
  referenceId: string | null;
  idempotencyKey: string;
  externalProvider: string | null;
  externalReference: string | null;
  createdBy: string | null;
  note: string | null;
  createdAt: string;
}
