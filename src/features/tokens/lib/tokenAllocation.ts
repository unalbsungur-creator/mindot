export type TokenSourceType = "purchase" | "reward" | "admin_grant" | "other";

export interface TokenSourceBalance {
  sourceType: TokenSourceType;
  /** Required for a purchase source; null for every non-purchase source. */
  purchaseLotId: string | null;
  remainingTokens: number;
  /** Stable ordering key; purchase lots use creation time then ID. */
  orderKey: string;
}

export interface TokenAllocation {
  sourceType: TokenSourceType;
  purchaseLotId: string | null;
  amount: number;
}

export function planTokenConsumption(
  requestedTokens: number,
  sources: readonly TokenSourceBalance[]
): TokenAllocation[] {
  if (!Number.isSafeInteger(requestedTokens) || requestedTokens <= 0) {
    throw new RangeError("requestedTokens must be a positive safe integer");
  }

  const ordered = [...sources].sort((a, b) => a.orderKey.localeCompare(b.orderKey));
  let available = 0;
  for (const source of ordered) {
    if (!Number.isSafeInteger(source.remainingTokens) || source.remainingTokens < 0) {
      throw new RangeError("remainingTokens must be a non-negative safe integer");
    }
    if (source.sourceType === "purchase" && !source.purchaseLotId) {
      throw new RangeError("purchase sources require a purchaseLotId");
    }
    if (source.sourceType !== "purchase" && source.purchaseLotId !== null) {
      throw new RangeError("non-purchase sources cannot reference a purchaseLotId");
    }
    available += source.remainingTokens;
  }

  if (!Number.isSafeInteger(available) || available < requestedTokens) {
    throw new RangeError("insufficient source balance for requested consumption");
  }

  let remaining = requestedTokens;
  const allocations: TokenAllocation[] = [];
  for (const source of ordered) {
    if (remaining === 0) break;
    if (source.remainingTokens === 0) continue;
    const amount = Math.min(source.remainingTokens, remaining);
    allocations.push({
      sourceType: source.sourceType,
      purchaseLotId: source.purchaseLotId,
      amount,
    });
    remaining -= amount;
  }
  return allocations;
}

/**
 * Existing purchase ledger entries have no purchase lot until they are
 * explicitly reconciled. They must not be treated as refundable purchases
 * merely because their ledger type is "purchase".
 */
export function classifyTokenSource(input: {
  ledgerType: string;
  purchaseLotId: string | null;
  referenceType?: string | null;
}): TokenSourceType {
  if (input.ledgerType === "purchase" && input.purchaseLotId) return "purchase";
  if (input.referenceType === "first_share_reward") return "reward";
  if (input.ledgerType === "grant") return "admin_grant";
  return "other";
}


export interface PurchaseLotForAllocation {
  id: string;
  creditedLedgerEntryId: string;
  packageTokens: number;
  allocatedTokens: number;
  orderKey: string;
}

export interface ReconciledTokenSource {
  sourceType: TokenSourceType;
  purchaseLotId: string | null;
  sourceLedgerEntryId: string;
  remainingTokens: number;
  orderKey: string;
}

export type ReconcileTokenSourcesResult =
  | { status: "ok"; sources: ReconciledTokenSource[]; legacyTokens: number }
  | { status: "inconsistent"; reason: "invalid_balance" | "invalid_lot" | "lot_allocations_exceed_package" | "tracked_tokens_exceed_wallet" | "legacy_anchor_missing" };

/**
 * Reconciles purchase-lot balances against the authoritative wallet balance.
 * Any untracked remainder is treated as legacy/other, never as refundable.
 * Call only while the user's wallet row is locked in the same transaction.
 */
export function reconcileTokenSources(input: {
  walletBalance: number;
  lots: readonly PurchaseLotForAllocation[];
  legacySourceLedgerEntryId: string | null;
}): ReconcileTokenSourcesResult {
  if (!Number.isSafeInteger(input.walletBalance) || input.walletBalance < 0) {
    return { status: "inconsistent", reason: "invalid_balance" };
  }

  const sources: ReconciledTokenSource[] = [];
  let trackedRemaining = 0;
  for (const lot of input.lots) {
    if (
      !lot.id ||
      !lot.creditedLedgerEntryId ||
      !Number.isSafeInteger(lot.packageTokens) ||
      lot.packageTokens <= 0 ||
      !Number.isSafeInteger(lot.allocatedTokens) ||
      lot.allocatedTokens < 0
    ) {
      return { status: "inconsistent", reason: "invalid_lot" };
    }
    if (lot.allocatedTokens > lot.packageTokens) {
      return { status: "inconsistent", reason: "lot_allocations_exceed_package" };
    }
    const remainingTokens = lot.packageTokens - lot.allocatedTokens;
    trackedRemaining += remainingTokens;
    sources.push({
      sourceType: "purchase",
      purchaseLotId: lot.id,
      sourceLedgerEntryId: lot.creditedLedgerEntryId,
      remainingTokens,
      orderKey: lot.orderKey,
    });
  }

  if (!Number.isSafeInteger(trackedRemaining) || trackedRemaining > input.walletBalance) {
    return { status: "inconsistent", reason: "tracked_tokens_exceed_wallet" };
  }

  const legacyTokens = input.walletBalance - trackedRemaining;
  if (legacyTokens > 0) {
    if (!input.legacySourceLedgerEntryId) {
      return { status: "inconsistent", reason: "legacy_anchor_missing" };
    }
    sources.push({
      sourceType: "other",
      purchaseLotId: null,
      sourceLedgerEntryId: input.legacySourceLedgerEntryId,
      remainingTokens: legacyTokens,
      orderKey: "0000-legacy",
    });
  }

  // Conservative refund accounting: spend tracked purchased Tokens first.
  // Historical/unattributed balance is never made refundable by this rule.
  sources.sort((a, b) => {
    if (a.sourceType !== b.sourceType) return a.sourceType === "purchase" ? -1 : 1;
    return a.orderKey.localeCompare(b.orderKey);
  });
  return { status: "ok", sources, legacyTokens };
}
