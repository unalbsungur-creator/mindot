import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateUnusedTokenRefundKurus } from "./refundMath";

describe("calculateUnusedTokenRefundKurus", () => {
  it("returns the full price when every purchased Token is unused", () => {
    assert.equal(calculateUnusedTokenRefundKurus({
      packageTokens: 10, packagePriceKurus: 1200, unusedTokens: 10,
    }), 1200);
  });

  it("returns zero when no purchased Tokens remain unused", () => {
    assert.equal(calculateUnusedTokenRefundKurus({
      packageTokens: 50, packagePriceKurus: 5000, unusedTokens: 0,
    }), 0);
  });

  it("rounds down deterministically to whole kuruş", () => {
    assert.equal(calculateUnusedTokenRefundKurus({
      packageTokens: 3, packagePriceKurus: 100, unusedTokens: 1,
    }), 33);
  });

  it("handles the configured package prices", () => {
    assert.equal(calculateUnusedTokenRefundKurus({
      packageTokens: 10, packagePriceKurus: 1200, unusedTokens: 7,
    }), 840);
    assert.equal(calculateUnusedTokenRefundKurus({
      packageTokens: 50, packagePriceKurus: 5000, unusedTokens: 25,
    }), 2500);
    assert.equal(calculateUnusedTokenRefundKurus({
      packageTokens: 100, packagePriceKurus: 8000, unusedTokens: 25,
    }), 2000);
  });

  it("does not exceed the original package price", () => {
    assert.ok(calculateUnusedTokenRefundKurus({
      packageTokens: 7, packagePriceKurus: 999, unusedTokens: 7,
    }) <= 999);
  });

  it("rejects invalid package sizes, prices, and unused amounts", () => {
    const invalid = [
      { packageTokens: 0, packagePriceKurus: 1200, unusedTokens: 0 },
      { packageTokens: -1, packagePriceKurus: 1200, unusedTokens: 0 },
      { packageTokens: 1.5, packagePriceKurus: 1200, unusedTokens: 1 },
      { packageTokens: 10, packagePriceKurus: -1, unusedTokens: 1 },
      { packageTokens: 10, packagePriceKurus: 1.5, unusedTokens: 1 },
      { packageTokens: 10, packagePriceKurus: 1200, unusedTokens: -1 },
      { packageTokens: 10, packagePriceKurus: 1200, unusedTokens: 11 },
      { packageTokens: Number.MAX_SAFE_INTEGER + 1, packagePriceKurus: 1200, unusedTokens: 1 },
    ];
    for (const input of invalid) {
      assert.throws(() => calculateUnusedTokenRefundKurus(input), RangeError);
    }
  });
});
