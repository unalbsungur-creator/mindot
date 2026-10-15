import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyTokenSource, planTokenConsumption, reconcileTokenSources } from "./tokenAllocation";

describe("planTokenConsumption", () => {
  it("allocates FIFO and can split one spend across sources", () => {
    assert.deepEqual(planTokenConsumption(4, [
      { sourceType: "purchase", purchaseLotId: "lot-b", remainingTokens: 2, orderKey: "2026-02" },
      { sourceType: "purchase", purchaseLotId: "lot-a", remainingTokens: 3, orderKey: "2026-01" },
    ]), [
      { sourceType: "purchase", purchaseLotId: "lot-a", amount: 3 },
      { sourceType: "purchase", purchaseLotId: "lot-b", amount: 1 },
    ]);
  });

  it("keeps reward and admin grants separate from paid purchase lots", () => {
    assert.deepEqual(planTokenConsumption(3, [
      { sourceType: "reward", purchaseLotId: null, remainingTokens: 2, orderKey: "2026-01" },
      { sourceType: "purchase", purchaseLotId: "lot-1", remainingTokens: 4, orderKey: "2026-02" },
      { sourceType: "admin_grant", purchaseLotId: null, remainingTokens: 1, orderKey: "2026-03" },
    ]), [
      { sourceType: "reward", purchaseLotId: null, amount: 2 },
      { sourceType: "purchase", purchaseLotId: "lot-1", amount: 1 },
    ]);
  });

  it("ignores empty sources and doesn't mutate the input", () => {
    const sources = [
      { sourceType: "purchase" as const, purchaseLotId: "lot-1", remainingTokens: 0, orderKey: "a" },
      { sourceType: "other" as const, purchaseLotId: null, remainingTokens: 2, orderKey: "b" },
    ];
    const before = structuredClone(sources);
    assert.deepEqual(planTokenConsumption(1, sources), [
      { sourceType: "other", purchaseLotId: null, amount: 1 },
    ]);
    assert.deepEqual(sources, before);
  });

  it("rejects invalid requests, invalid source attribution, and insufficient sources", () => {
    const valid = [{ sourceType: "purchase" as const, purchaseLotId: "lot-1", remainingTokens: 1, orderKey: "a" }];
    for (const n of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
      assert.throws(() => planTokenConsumption(n, valid), RangeError);
    }
    assert.throws(() => planTokenConsumption(2, valid), RangeError);
    assert.throws(() => planTokenConsumption(1, [
      { sourceType: "purchase", purchaseLotId: null, remainingTokens: 1, orderKey: "a" },
    ]), RangeError);
    assert.throws(() => planTokenConsumption(1, [
      { sourceType: "reward", purchaseLotId: "wrong", remainingTokens: 1, orderKey: "a" },
    ]), RangeError);
    assert.throws(() => planTokenConsumption(1, [
      { sourceType: "other", purchaseLotId: null, remainingTokens: -1, orderKey: "a" },
    ]), RangeError);
  });
});

 
describe("classifyTokenSource", () => {
  it("does not treat historical purchases without a purchase lot as refundable lots", () => {
    assert.equal(classifyTokenSource({ ledgerType: "purchase", purchaseLotId: null, referenceType: "shopier_order" }), "other");
  });

  it("classifies only purchases with a linked lot as purchase sources", () => {
    assert.equal(classifyTokenSource({ ledgerType: "purchase", purchaseLotId: "lot-1" }), "purchase");
  });

  it("keeps share rewards and admin grants distinct", () => {
    assert.equal(classifyTokenSource({ ledgerType: "grant", purchaseLotId: null, referenceType: "first_share_reward" }), "reward");
    assert.equal(classifyTokenSource({ ledgerType: "grant", purchaseLotId: null }), "admin_grant");
  });
});


describe("reconcileTokenSources", () => {
  it("keeps legacy balance non-refundable and spends tracked purchases first", () => {
    const result = reconcileTokenSources({
      walletBalance: 8,
      legacySourceLedgerEntryId: "legacy-ledger",
      lots: [{ id: "lot-1", creditedLedgerEntryId: "purchase-ledger", packageTokens: 5, allocatedTokens: 2, orderKey: "2026-01" }],
    });
    assert.equal(result.status, "ok");
    if (result.status !== "ok") return;
    assert.equal(result.legacyTokens, 5);
    assert.deepEqual(result.sources, [
      { sourceType: "purchase", purchaseLotId: "lot-1", sourceLedgerEntryId: "purchase-ledger", remainingTokens: 3, orderKey: "2026-01" },
      { sourceType: "other", purchaseLotId: null, sourceLedgerEntryId: "legacy-ledger", remainingTokens: 5, orderKey: "0000-legacy" },
    ]);
  });

  it("fails closed if tracked purchase balance exceeds the wallet", () => {
    assert.deepEqual(reconcileTokenSources({
      walletBalance: 2,
      legacySourceLedgerEntryId: "legacy",
      lots: [{ id: "lot", creditedLedgerEntryId: "entry", packageTokens: 5, allocatedTokens: 0, orderKey: "a" }],
    }), { status: "inconsistent", reason: "tracked_tokens_exceed_wallet" });
  });

  it("fails closed when a legacy remainder has no ledger anchor", () => {
    assert.deepEqual(reconcileTokenSources({
      walletBalance: 3,
      legacySourceLedgerEntryId: null,
      lots: [],
    }), { status: "inconsistent", reason: "legacy_anchor_missing" });
  });
});
