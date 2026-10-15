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
