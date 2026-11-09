import type { AppEnvironment } from "@/lib/appEnvironment";

/**
 * MN-01 moderation alerts — the pure types and constants.
 *
 * This layer only DECIDES. It never sends an email, reads the environment,
 * touches the database, hashes an address or reads the clock: every input
 * (including `now`) is handed in, so the same input always gives the same
 * decision. Persistence, the lease token, HMAC hashing of addresses and the
 * provider call live in later layers (MN-01 T2/T3).
 *
 * Privacy: nothing here ever holds a recipient address. Recipients are
 * identified only by an `AddressHash` (an HMAC-SHA256 hex digest computed
 * outside this layer), and that is the only recipient identifier any
 * persisted row or log line may contain.
 */

const MINUTE_MS = 60_000;

/** Minimum time between two SUCCESSFUL notifications to the same recipient. */
export const REMINDER_INTERVAL_MS = 30 * MINUTE_MS;

/** How long a claim holds the global send lease before another evaluation may recover it. */
export const LEASE_DURATION_MS = 60_000;

/** Per-send provider timeout the sending layer must use (kept well inside the lease). */
export const SEND_TIMEOUT_MS = 10_000;

/**
 * Wait after the 1st, 2nd and 3rd consecutive failed attempt of one send.
 * After the 4th failure ({@link MAX_SEND_ATTEMPTS}) the send is exhausted and
 * the next attempt waits for a fresh 30-minute window instead.
 */
export const RETRY_DELAYS_MS: readonly number[] = [1 * MINUTE_MS, 5 * MINUTE_MS, 15 * MINUTE_MS];

/** Attempts per send sequence: the first try plus one retry per {@link RETRY_DELAYS_MS} entry. */
export const MAX_SEND_ATTEMPTS = RETRY_DELAYS_MS.length + 1;

/** Hard cap on configured recipients — more than this disables alerts (never truncated). */
export const MAX_ALERT_RECIPIENTS = 5;

/** HMAC-SHA256 hex digest of a normalized recipient address — 64 lowercase hex characters. */
export type AddressHash = string;

export const ADDRESS_HASH_PATTERN = /^[0-9a-f]{64}$/;

export type AlertDisabledReason =
  | "flag-off"
  | "no-recipients"
  | "invalid-recipient"
  | "too-many-recipients"
  | "provider-not-configured"
  | "hash-key-missing";

export type AlertConfigState =
  | {
      status: "enabled";
      environment: AppEnvironment;
      /** Unique, at most {@link MAX_ALERT_RECIPIENTS}. Order does not matter. */
      recipients: readonly AddressHash[];
    }
  | { status: "disabled"; reason: AlertDisabledReason };

/**
 * One alert cycle spans one continuous non-empty stretch of the review queue.
 * `generation` counts cycles: 0 means none has ever started; a new cycle is
 * always the previous generation + 1, so rows of an older cycle never match.
 */
export type AlertCycleState =
  | { phase: "idle"; generation: number }
  | { phase: "active"; generation: number; startedAt: Date };

/** The single global send lease. Its random token lives only in the database. */
export interface AlertLeaseState {
  generation: number;
  expiresAt: Date;
}

/**
 * Delivery bookkeeping for one recipient within one generation.
 *
 * Lifecycle of one attempt: a claim sets `inFlight = true` and
 * `lastAttemptAt = claim time`; the completion sets `inFlight = false` and
 * either records success (`lastSuccessAt = claim time`, failures reset) or
 * adds one to `consecutiveFailures`. A row still `inFlight` after its lease
 * expired is an attempt whose outcome is unknown — it counts as a failure.
 * Retry times are derived from `lastAttemptAt`, never stored separately.
 */
export interface RecipientDeliveryState {
  addressHash: AddressHash;
  generation: number;
  /** 1 = the initial send; every reminder (or fresh window after exhaustion) is +1. A retry keeps it. */
  sendSequence: number;
  /** Claim time of the last successful send — the anchor of the 30-minute minimum. */
  lastSuccessAt: Date | null;
  /** Claim time of the most recent attempt. */
  lastAttemptAt: Date | null;
  /** Failed attempts of the current send sequence, 0..{@link MAX_SEND_ATTEMPTS}. */
  consecutiveFailures: number;
  /** True between a claim and its completion. */
  inFlight: boolean;
}

export interface ModerationAlertInput {
  /** The evaluation instant (the database's `now()` in production). */
  now: Date;
  /** Pending messages plus pending revisions. A reconsidered message is simply pending again. */
  pendingReviewCount: number;
  config: AlertConfigState;
  cycle: AlertCycleState;
  lease: AlertLeaseState | null;
  /** Rows of any generation; rows of other generations and of removed recipients are ignored. */
  recipients: readonly RecipientDeliveryState[];
}

/**
 * - `initial`: the first send of a generation.
 * - `retry`: another attempt of the same send (same sequence, same idempotency key).
 * - `reminder`: a new send after the 30-minute minimum, or a fresh window after
 *   a send exhausted its retries (new sequence, new idempotency key).
 */
export type AlertSendKind = "initial" | "retry" | "reminder";

/** Which email wording to use: a recipient who never received this cycle's alert still gets the initial wording. */
export type AlertTemplateKind = "initial" | "reminder";

export interface AlertSend {
  addressHash: AddressHash;
  kind: AlertSendKind;
  templateKind: AlertTemplateKind;
  sendSequence: number;
  idempotencyKey: string;
}

export type AlertClaimType = "CLAIM_INITIAL" | "RETRY_RECIPIENT" | "CLAIM_REMINDER";

export type NoActionReason = "invalid-input" | "queue-empty" | "alerts-disabled" | "lease-held" | "nothing-due";

export type ModerationAlertDecision =
  | { type: "START_CYCLE"; generation: number; startedAt: Date }
  | { type: AlertClaimType; generation: number; leaseExpiresAt: Date; sends: AlertSend[] }
  | { type: "RESET_CYCLE"; generation: number }
  | { type: "NO_ACTION"; reason: NoActionReason; nextDueAt: Date | null };
