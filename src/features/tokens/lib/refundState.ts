export type TokenRefundStatus = "pending_external_refund" | "external_refund_confirmed" | "cancelled";

export interface TokenRefundState {
  status: TokenRefundStatus;
  externalRefundReference: string | null;
  confirmedAt: string | null;
}

export type TokenRefundTransition =
  | { ok: true; state: TokenRefundState; outcome: "transitioned" | "already_confirmed" | "already_cancelled" }
  | { ok: false; error: "invalid_reference" | "invalid_timestamp" | "terminal_state" | "reference_conflict" };

/**
 * Pure state-transition guard for the admin refund workflow.
 * This does not call Shopier, change a wallet, or persist a refund.
 * A refund is confirmed only after an operator supplies the real external
 * Shopier refund reference and a valid confirmation timestamp.
 */
export function transitionTokenRefund(
  current: TokenRefundState,
  action:
    | { type: "confirm_external_refund"; externalRefundReference: string; confirmedAt: string }
    | { type: "cancel" }
): TokenRefundTransition {
  if (current.status === "external_refund_confirmed") {
    if (action.type === "confirm_external_refund") {
      const reference = action.externalRefundReference.trim();
      if (reference && reference === current.externalRefundReference) {
        return { ok: true, state: current, outcome: "already_confirmed" };
      }
      return { ok: false, error: "reference_conflict" };
    }
    return { ok: false, error: "terminal_state" };
  }

  if (current.status === "cancelled") {
    return action.type === "cancel"
      ? { ok: true, state: current, outcome: "already_cancelled" }
      : { ok: false, error: "terminal_state" };
  }

  if (action.type === "cancel") {
    return {
      ok: true,
      state: { status: "cancelled", externalRefundReference: null, confirmedAt: null },
      outcome: "transitioned",
    };
  }

  const reference = action.externalRefundReference.trim();
  if (!reference || reference.length > 200) return { ok: false, error: "invalid_reference" };
  const timestamp = Date.parse(action.confirmedAt);
  if (!Number.isFinite(timestamp)) return { ok: false, error: "invalid_timestamp" };

  return {
    ok: true,
    state: {
      status: "external_refund_confirmed",
      externalRefundReference: reference,
      confirmedAt: new Date(timestamp).toISOString(),
    },
    outcome: "transitioned",
  };
}
