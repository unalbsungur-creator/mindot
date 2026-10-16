/**
 * Pure refund arithmetic only. This does not decide whether a refund is
 * legally/policy eligible, whether Shopier has refunded the payment, or
 * which purchase lot owns the unused Tokens. Those checks belong to the
 * transactional repository/admin workflow.
 *
 * Prices are integer kuruş; never use floating-point TRY for money.
 */
export interface UnusedTokenRefundInput {
  packageTokens: number;
  packagePriceKurus: number;
  unusedTokens: number;
}

export function calculateUnusedTokenRefundKurus({
  packageTokens,
  packagePriceKurus,
  unusedTokens,
}: UnusedTokenRefundInput): number {
  if (!Number.isSafeInteger(packageTokens) || packageTokens <= 0) {
    throw new RangeError("packageTokens must be a positive safe integer");
  }
  if (!Number.isSafeInteger(packagePriceKurus) || packagePriceKurus < 0) {
    throw new RangeError("packagePriceKurus must be a non-negative safe integer");
  }
  if (!Number.isSafeInteger(unusedTokens) || unusedTokens < 0 || unusedTokens > packageTokens) {
    throw new RangeError("unusedTokens must be an integer between zero and packageTokens");
  }

  // Agreed rule: at most 10% consumed yields a full-price refund. Above 10%,
  // refund only the value of unused Tokens. Use integer arithmetic throughout.
  const usedTokens = packageTokens - unusedTokens;
  if (BigInt(usedTokens) * 10n <= BigInt(packageTokens)) return packagePriceKurus;
  return Number((BigInt(packagePriceKurus) * BigInt(unusedTokens)) / BigInt(packageTokens));
}
