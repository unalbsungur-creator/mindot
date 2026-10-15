import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { transitionTokenRefund, type TokenRefundState } from "./refundState";

const pending: TokenRefundState = {
  status: "pending_external_refund",
  externalRefundReference: null,
  confirmedAt: null,
};

describe("transitionTokenRefund", () => {
  it("confirms only with a real external reference and valid timestamp", () => {
    const result = transitionTokenRefund(pending, {
      type: "confirm_external_refund",
      externalRefundReference: "SHOPIER-REF-123",
      confirmedAt: "2026-10-15T12:00:00.000Z",
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.state.status, "external_refund_confirmed");
      assert.equal(result.state.externalRefundReference, "SHOPIER-REF-123");
      assert.equal(result.state.confirmedAt, "2026-10-15T12:00:00.000Z");
    }
  });

  it("rejects a blank or oversized external reference", () => {
    for (const externalRefundReference of [" ", "x".repeat(201)]) {
      const result = transitionTokenRefund(pending, {
        type: "confirm_external_refund",
        externalRefundReference,
        confirmedAt: "2026-10-15T12:00:00.000Z",
      });
      assert.deepEqual(result, { ok: false, error: "invalid_reference" });
    }
  });

  it("rejects an invalid confirmation timestamp", () => {
    assert.deepEqual(transitionTokenRefund(pending, {
      type: "confirm_external_refund",
      externalRefundReference: "SHOPIER-REF-123",
      confirmedAt: "not-a-date",
    }), { ok: false, error: "invalid_timestamp" });
  });

  it("allows cancelling a pending refund without claiming an external refund", () => {
    assert.deepEqual(transitionTokenRefund(pending, { type: "cancel" }), {
      ok: true,
      state: { status: "cancelled", externalRefundReference: null, confirmedAt: null },
      outcome: "transitioned",
    });
  });

  it("treats a retry with the same confirmed reference as idempotent", () => {
    const confirmed: TokenRefundState = {
      status: "external_refund_confirmed",
      externalRefundReference: "SHOPIER-REF-123",
      confirmedAt: "2026-10-15T12:00:00.000Z",
    };
    assert.deepEqual(transitionTokenRefund(confirmed, {
      type: "confirm_external_refund",
      externalRefundReference: "SHOPIER-REF-123",
      confirmedAt: "2026-10-15T12:30:00.000Z",
    }), { ok: true, state: confirmed, outcome: "already_confirmed" });
  });

  it("rejects conflicting references and transitions out of terminal states", () => {
    const confirmed: TokenRefundState = {
      status: "external_refund_confirmed",
      externalRefundReference: "SHOPIER-REF-123",
      confirmedAt: "2026-10-15T12:00:00.000Z",
    };
    assert.deepEqual(transitionTokenRefund(confirmed, {
      type: "confirm_external_refund",
      externalRefundReference: "OTHER-REF",
      confirmedAt: "2026-10-15T12:30:00.000Z",
    }), { ok: false, error: "reference_conflict" });
    assert.deepEqual(transitionTokenRefund(confirmed, { type: "cancel" }), {
      ok: false, error: "terminal_state",
    });
  });
});
