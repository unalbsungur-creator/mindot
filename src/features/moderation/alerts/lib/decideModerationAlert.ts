import type { AppEnvironment } from "@/lib/appEnvironment";
import {
  ADDRESS_HASH_PATTERN,
  LEASE_DURATION_MS,
  MAX_ALERT_RECIPIENTS,
  MAX_SEND_ATTEMPTS,
  REMINDER_INTERVAL_MS,
  RETRY_DELAYS_MS,
  type AddressHash,
  type AlertClaimType,
  type AlertDisabledReason,
  type AlertSend,
  type AlertSendKind,
  type ModerationAlertDecision,
  type ModerationAlertInput,
  type RecipientDeliveryState,
} from "../types";

/**
 * MN-01 moderation alerts — the pure decision.
 *
 * `decideModerationAlert` looks at one snapshot (queue size, cycle, lease,
 * per-recipient delivery rows, configuration, `now`) and returns exactly one
 * next step. It never reads the clock, the environment or the database, never
 * sends anything and never mutates its input. The caller applies the decision
 * with a conditional database write, re-reads and evaluates again; concurrency
 * is settled by those writes, not here.
 *
 * Priority (first match wins):
 *  1. invalid input                         → NO_ACTION invalid-input (fail closed)
 *  2. queue empty, cycle active              → RESET_CYCLE (even under a live lease)
 *  3. queue empty, cycle idle                → NO_ACTION queue-empty
 *  4. queue non-empty, cycle idle            → START_CYCLE (generation + 1, even when disabled)
 *  5. alerts disabled                        → NO_ACTION alerts-disabled
 *  6. live lease of this generation          → NO_ACTION lease-held
 *  7. a configured recipient has no row      → CLAIM_INITIAL
 *  8. a failed send is due for a retry       → RETRY_RECIPIENT (same sequence, same key)
 *  9. a reminder / fresh window is due       → CLAIM_REMINDER (new sequence, new key)
 * 10. otherwise                              → NO_ACTION nothing-due (with the next due time)
 *
 * Timing per recipient (all boundaries inclusive — due when `now >= dueAt`):
 *  - reminder: `lastSuccessAt + 30 min`;
 *  - retry after failure f (1..3): `lastAttemptAt + 1 / 5 / 15 min`;
 *  - after the 4th failure (exhausted): `lastAttemptAt + 30 min`, as a new send;
 *  - and EVERY send to a recipient who has a success in this generation is
 *    additionally held to `lastSuccessAt + 30 min` — a failed retry can never
 *    shorten the 30-minute minimum between successful notifications.
 */

const MAX_GENERATION = Number.MAX_SAFE_INTEGER - 1;

const APP_ENVIRONMENTS: readonly AppEnvironment[] = ["development", "staging", "production"];

const DISABLED_REASONS: readonly AlertDisabledReason[] = [
  "flag-off",
  "no-recipients",
  "invalid-recipient",
  "too-many-recipients",
  "provider-not-configured",
  "hash-key-missing",
];

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function isDateOrNull(value: unknown): value is Date | null {
  return value === null || isValidDate(value);
}

function isIntInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
}

function isAddressHash(value: unknown): value is AddressHash {
  return typeof value === "string" && ADDRESS_HASH_PATTERN.test(value);
}

function isValidRow(row: RecipientDeliveryState): boolean {
  if (!row || typeof row !== "object") return false;
  if (!isAddressHash(row.addressHash)) return false;
  if (!isIntInRange(row.generation, 1, MAX_GENERATION)) return false;
  if (!isIntInRange(row.sendSequence, 1, Number.MAX_SAFE_INTEGER - 1)) return false;
  if (!isIntInRange(row.consecutiveFailures, 0, MAX_SEND_ATTEMPTS)) return false;
  if (typeof row.inFlight !== "boolean") return false;
  if (!isDateOrNull(row.lastSuccessAt) || !isDateOrNull(row.lastAttemptAt)) return false;

  // Every row starts with a claim, so an attempt time always exists.
  if (row.lastAttemptAt === null) return false;
  // A success is anchored on its own attempt's claim time, so it can never be later than the last attempt.
  if (row.lastSuccessAt !== null && row.lastSuccessAt.getTime() > row.lastAttemptAt.getTime()) return false;
  // An exhausted send is never claimed again under the same sequence.
  if (row.inFlight && row.consecutiveFailures >= MAX_SEND_ATTEMPTS) return false;
  // A completed attempt with no failure must have been a success.
  if (!row.inFlight && row.consecutiveFailures === 0 && row.lastSuccessAt === null) return false;
  return true;
}

function isValidInput(input: ModerationAlertInput): boolean {
  if (!input || typeof input !== "object") return false;
  if (!isValidDate(input.now)) return false;
  if (!isIntInRange(input.pendingReviewCount, 0, Number.MAX_SAFE_INTEGER)) return false;

  const { cycle, lease, config, recipients } = input;
  if (!cycle || typeof cycle !== "object") return false;
  if (cycle.phase === "idle") {
    if (!isIntInRange(cycle.generation, 0, MAX_GENERATION)) return false;
  } else if (cycle.phase === "active") {
    if (!isIntInRange(cycle.generation, 1, MAX_GENERATION) || !isValidDate(cycle.startedAt)) return false;
  } else {
    return false;
  }

  if (lease !== null) {
    if (!lease || typeof lease !== "object") return false;
    if (!isIntInRange(lease.generation, 0, MAX_GENERATION) || !isValidDate(lease.expiresAt)) return false;
  }

  if (!config || typeof config !== "object") return false;
  if (config.status === "enabled") {
    if (!APP_ENVIRONMENTS.includes(config.environment)) return false;
    if (!Array.isArray(config.recipients)) return false;
    if (config.recipients.length === 0 || config.recipients.length > MAX_ALERT_RECIPIENTS) return false;
    if (!config.recipients.every(isAddressHash)) return false;
    if (new Set(config.recipients).size !== config.recipients.length) return false;
  } else if (config.status === "disabled") {
    if (!DISABLED_REASONS.includes(config.reason)) return false;
  } else {
    return false;
  }

  if (!Array.isArray(recipients)) return false;
  const seen = new Set<string>();
  for (const row of recipients) {
    if (!isValidRow(row)) return false;
    const key = `${row.generation}:${row.addressHash}`;
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

/**
 * The provider idempotency key of one send. A retry of a send reuses its key
 * (so a provider can drop a duplicate whose first response was lost); a new
 * generation, a new sequence or another environment always gets a new key.
 * It carries the address HASH only — never an address.
 */
export function alertIdempotencyKey(
  environment: AppEnvironment,
  generation: number,
  addressHash: AddressHash,
  sendSequence: number
): string {
  if (!APP_ENVIRONMENTS.includes(environment)) throw new RangeError("unknown environment");
  if (!isIntInRange(generation, 1, MAX_GENERATION)) throw new RangeError("invalid generation");
  if (!isAddressHash(addressHash)) throw new RangeError("invalid address hash");
  if (!isIntInRange(sendSequence, 1, Number.MAX_SAFE_INTEGER - 1)) throw new RangeError("invalid send sequence");
  return `mindot-modalert:${environment}:g${generation}:${addressHash}:s${sendSequence}`;
}

interface DueSend {
  claimType: AlertClaimType;
  dueAtMs: number;
  kind: AlertSendKind;
  sendSequence: number;
  hasSucceeded: boolean;
}

/** Failed attempts of the current send, counting an abandoned in-flight attempt as failed. */
function effectiveFailures(row: RecipientDeliveryState): number {
  return row.consecutiveFailures + (row.inFlight ? 1 : 0);
}

/** When (and as what) this recipient's next send becomes due. `row` is null for a recipient with no row yet. */
function nextSendFor(row: RecipientDeliveryState | null, nowMs: number): DueSend {
  if (row === null) {
    return { claimType: "CLAIM_INITIAL", dueAtMs: nowMs, kind: "initial", sendSequence: 1, hasSucceeded: false };
  }

  const lastAttemptMs = (row.lastAttemptAt as Date).getTime();
  const hasSucceeded = row.lastSuccessAt !== null;
  // The 30-minute minimum between successful notifications binds every kind of send.
  const successFloorMs = hasSucceeded ? (row.lastSuccessAt as Date).getTime() + REMINDER_INTERVAL_MS : -Infinity;
  const failures = effectiveFailures(row);

  if (failures === 0) {
    return {
      claimType: "CLAIM_REMINDER",
      dueAtMs: successFloorMs,
      kind: "reminder",
      sendSequence: row.sendSequence + 1,
      hasSucceeded,
    };
  }

  if (failures < MAX_SEND_ATTEMPTS) {
    return {
      claimType: "RETRY_RECIPIENT",
      dueAtMs: Math.max(lastAttemptMs + RETRY_DELAYS_MS[failures - 1], successFloorMs),
      kind: "retry",
      sendSequence: row.sendSequence,
      hasSucceeded,
    };
  }

  // Exhausted: a fresh send no earlier than 30 min after the last attempt —
  // and never earlier than 30 min after the last success either.
  return {
    claimType: "CLAIM_REMINDER",
    dueAtMs: Math.max(lastAttemptMs + REMINDER_INTERVAL_MS, successFloorMs),
    kind: "reminder",
    sendSequence: row.sendSequence + 1,
    hasSucceeded,
  };
}

/**
 * When a completed recipient row's next send becomes due — its retry after a
 * failure, or its reminder / fresh window — by the same rules as
 * `decideModerationAlert`. Bookkeeping only (the `next_attempt_at` column and
 * the cron's "anything due?" check); the decision never reads it back.
 * `null` for a row with no defined next send (an attempt still in flight).
 */
export function nextDueAtFor(row: RecipientDeliveryState): Date | null {
  if (row.inFlight || !isValidRow(row)) return null;
  const dueAtMs = nextSendFor(row, 0).dueAtMs;
  return Number.isFinite(dueAtMs) ? new Date(dueAtMs) : null;
}

const CLAIM_PRIORITY: readonly AlertClaimType[] = ["CLAIM_INITIAL", "RETRY_RECIPIENT", "CLAIM_REMINDER"];

export function decideModerationAlert(input: ModerationAlertInput): ModerationAlertDecision {
  if (!isValidInput(input)) return { type: "NO_ACTION", reason: "invalid-input", nextDueAt: null };

  const { now, pendingReviewCount, config, cycle, lease, recipients } = input;
  const nowMs = now.getTime();

  if (pendingReviewCount === 0) {
    return cycle.phase === "active"
      ? { type: "RESET_CYCLE", generation: cycle.generation }
      : { type: "NO_ACTION", reason: "queue-empty", nextDueAt: null };
  }

  if (cycle.phase === "idle") {
    return { type: "START_CYCLE", generation: cycle.generation + 1, startedAt: new Date(nowMs) };
  }

  if (config.status !== "enabled") return { type: "NO_ACTION", reason: "alerts-disabled", nextDueAt: null };

  const generation = cycle.generation;
  if (lease !== null && lease.generation === generation && nowMs < lease.expiresAt.getTime()) {
    return { type: "NO_ACTION", reason: "lease-held", nextDueAt: new Date(lease.expiresAt.getTime()) };
  }

  const rowsByHash = new Map<AddressHash, RecipientDeliveryState>();
  for (const row of recipients) {
    if (row.generation === generation) rowsByHash.set(row.addressHash, row);
  }

  const due = new Map<AlertClaimType, AlertSend[]>();
  let nextDueMs = Infinity;
  for (const addressHash of [...config.recipients].sort()) {
    const next = nextSendFor(rowsByHash.get(addressHash) ?? null, nowMs);
    if (next.dueAtMs > nowMs) {
      nextDueMs = Math.min(nextDueMs, next.dueAtMs);
      continue;
    }
    const sends = due.get(next.claimType) ?? [];
    sends.push({
      addressHash,
      kind: next.kind,
      templateKind: next.hasSucceeded ? "reminder" : "initial",
      sendSequence: next.sendSequence,
      idempotencyKey: alertIdempotencyKey(config.environment, generation, addressHash, next.sendSequence),
    });
    due.set(next.claimType, sends);
  }

  for (const claimType of CLAIM_PRIORITY) {
    const sends = due.get(claimType);
    if (sends && sends.length > 0) {
      return { type: claimType, generation, leaseExpiresAt: new Date(nowMs + LEASE_DURATION_MS), sends };
    }
  }

  return {
    type: "NO_ACTION",
    reason: "nothing-due",
    nextDueAt: Number.isFinite(nextDueMs) ? new Date(nextDueMs) : null,
  };
}

/**
 * The row a claim writes for one send. `previous` is this recipient's row of
 * the same generation (null for an initial send). A retry carries the failure
 * count forward (an abandoned in-flight attempt counted as failed); a new
 * sequence starts at zero failures. The previous success anchor is kept.
 */
export function claimedRecipientState(
  previous: RecipientDeliveryState | null,
  send: Pick<AlertSend, "addressHash" | "kind" | "sendSequence">,
  generation: number,
  claimNow: Date
): RecipientDeliveryState {
  if (!isValidDate(claimNow)) throw new RangeError("claimNow must be a valid Date");
  if (send.kind === "retry" && previous === null) throw new RangeError("a retry needs the previous row");
  return {
    addressHash: send.addressHash,
    generation,
    sendSequence: send.sendSequence,
    lastSuccessAt: previous?.lastSuccessAt ? new Date(previous.lastSuccessAt.getTime()) : null,
    lastAttemptAt: new Date(claimNow.getTime()),
    consecutiveFailures: send.kind === "retry" && previous ? effectiveFailures(previous) : 0,
    inFlight: true,
  };
}

/**
 * The row after a send's outcome is known. A success anchors the 30-minute
 * clock on the attempt's own claim time (not the provider's response time),
 * so the schedule never drifts with provider latency.
 */
export function applyDeliveryResult(row: RecipientDeliveryState, delivered: boolean): RecipientDeliveryState {
  if (!row.inFlight) throw new RangeError("only an in-flight attempt can complete");
  if (!isValidDate(row.lastAttemptAt)) throw new RangeError("an in-flight attempt needs its claim time");
  return delivered
    ? { ...row, inFlight: false, consecutiveFailures: 0, lastSuccessAt: new Date(row.lastAttemptAt.getTime()) }
    : { ...row, inFlight: false, consecutiveFailures: row.consecutiveFailures + 1 };
}

/** What a sender holds from its claim, and what the database currently holds for that recipient. */
export interface CompletionIdentity {
  generation: number;
  leaseToken: string;
  sendSequence: number;
}

/**
 * Whether a completion may still be written. It is stale — and must be
 * discarded — once the cycle moved on (reset or a new generation), another
 * evaluation re-claimed after the lease expired, or the recipient's sequence
 * advanced. A stale sender's email may still have gone out: delivery is
 * at-least-once at best, never exactly-once.
 */
export function isCompletionCurrent(claimed: CompletionIdentity, current: CompletionIdentity | null): boolean {
  if (current === null) return false;
  if (typeof claimed.leaseToken !== "string" || claimed.leaseToken.length === 0) return false;
  return (
    claimed.generation === current.generation &&
    claimed.leaseToken === current.leaseToken &&
    claimed.sendSequence === current.sendSequence
  );
}
