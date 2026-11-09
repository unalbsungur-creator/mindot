import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { MAX_ALERT_PENDING_COUNT } from "./lib/alertEmailTemplate";
import { applyDeliveryResult, claimedRecipientState, decideModerationAlert, isCompletionCurrent, nextDueAtFor } from "./lib/decideModerationAlert";
import type {
  AddressHash,
  AlertConfigState,
  AlertCycleState,
  AlertLeaseState,
  AlertSendKind,
  AlertTemplateKind,
  NoActionReason,
  RecipientDeliveryState,
} from "./types";

/**
 * MN-01 moderation alerts — persistence (migration 0030).
 *
 * The pure decision (lib/decideModerationAlert.ts) is applied here inside one
 * transaction that holds the single `moderation_alert_state` row FOR UPDATE:
 * concurrent evaluations (a submission and the cron, or two submissions)
 * queue on that row lock, and the second one sees the first one's lease and
 * stops ("lease-held"). That is what makes two simultaneous runs send once.
 *
 * A claim writes a random lease token on the state row and on every claimed
 * recipient row. A completion is accepted only while that token, the cycle's
 * generation and the row's send sequence still match (`isCompletionCurrent`):
 * a sender whose lease expired and was re-claimed, or whose cycle was reset,
 * can no longer overwrite the newer state (fencing).
 *
 * The claimed pending count and wording are fixed per send sequence, so a
 * retry sends exactly the same email under the same idempotency key.
 * Clock: always the database's `now()`, never the Worker's.
 * No email address ever reaches this module — only HMAC hashes.
 */

export interface ClaimedSend {
  addressHash: AddressHash;
  kind: AlertSendKind;
  templateKind: AlertTemplateKind;
  sendSequence: number;
  idempotencyKey: string;
  /** The pending count fixed when this send sequence was claimed — the number the email states. */
  claimedCount: number;
}

export interface AlertClaim {
  generation: number;
  leaseToken: string;
  leaseExpiresAt: Date;
  sends: ClaimedSend[];
}

export type AlertEvaluation =
  | { status: "claimed"; claim: AlertClaim; pendingReviewCount: number }
  | { status: "idle"; reason: NoActionReason | "cycle-reset"; nextDueAt: Date | null; pendingReviewCount: number };

interface StateRow {
  phase: "idle" | "active";
  generation: number;
  cycle_started_at: Date | null;
  lease_token: string | null;
  lease_generation: number | null;
  lease_expires_at: Date | null;
}

interface RecipientRow {
  generation: number;
  address_hash: string;
  send_sequence: number;
  template_kind: AlertTemplateKind;
  claimed_count: number;
  last_success_at: Date | null;
  last_attempt_at: Date;
  consecutive_failures: number;
  in_flight: boolean;
  lease_token: string;
}

type Executor = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> };
/** The database a call runs on — the app's by default; tests pass a second connection to act as a second Worker. */
export type AlertDb = ReturnType<typeof getDb>;

async function rows<T>(executor: Executor, query: ReturnType<typeof sql>): Promise<T[]> {
  return (await executor.execute(query)) as unknown as T[];
}

/**
 * Timestamps cross this boundary explicitly: drizzle's postgres-js driver
 * returns raw-SQL timestamptz values as text, and the decision layer only
 * accepts real Dates (anything else is "invalid-input", fail closed).
 */
function toDate(value: unknown): Date {
  if (value instanceof Date) return value;
  const text = String(value).trim().replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00");
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) throw new Error("unreadable timestamp from the database");
  return date;
}

function toDateOrNull(value: unknown): Date | null {
  return value === null || value === undefined ? null : toDate(value);
}

/** A Date as a timestamptz parameter. */
function ts(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

function normalizeState(raw: StateRow): StateRow {
  return {
    ...raw,
    generation: Number(raw.generation),
    cycle_started_at: toDateOrNull(raw.cycle_started_at),
    lease_generation: raw.lease_generation === null ? null : Number(raw.lease_generation),
    lease_expires_at: toDateOrNull(raw.lease_expires_at),
  };
}

function normalizeRecipient(raw: RecipientRow): RecipientRow {
  return {
    ...raw,
    generation: Number(raw.generation),
    send_sequence: Number(raw.send_sequence),
    claimed_count: Number(raw.claimed_count),
    consecutive_failures: Number(raw.consecutive_failures),
    last_success_at: toDateOrNull(raw.last_success_at),
    last_attempt_at: toDate(raw.last_attempt_at),
  };
}

function randomToken(): string {
  return [...crypto.getRandomValues(new Uint8Array(24))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function toDeliveryState(row: RecipientRow): RecipientDeliveryState {
  return {
    addressHash: row.address_hash,
    generation: row.generation,
    sendSequence: row.send_sequence,
    lastSuccessAt: row.last_success_at,
    lastAttemptAt: row.last_attempt_at,
    consecutiveFailures: row.consecutive_failures,
    inFlight: row.in_flight,
  };
}

function cycleOf(state: StateRow): AlertCycleState {
  return state.phase === "active" && state.cycle_started_at
    ? { phase: "active", generation: state.generation, startedAt: state.cycle_started_at }
    : { phase: "idle", generation: state.generation };
}

function leaseOf(state: StateRow): AlertLeaseState | null {
  return state.lease_token && state.lease_generation !== null && state.lease_expires_at
    ? { generation: state.lease_generation, expiresAt: state.lease_expires_at }
    : null;
}

/** Messages waiting for a first review plus approved messages with a pending revision — the admin queue. */
async function pendingReviewCount(executor: Executor): Promise<number> {
  const [row] = await rows<{ count: number }>(
    executor,
    sql`select ((select count(*) from messages where status = 'pending') + (select count(*) from messages where pending_content is not null))::int as count`
  );
  return row?.count ?? 0;
}

/** Most decision steps a single evaluation applies (START_CYCLE then a claim, at most). */
const MAX_STEPS = 3;

/**
 * Evaluates the alert state once and applies the decision: starts or resets
 * a cycle, or claims the due sends (taking the lease). Returns the claim for
 * the caller to deliver, or why nothing is to be sent and when something next
 * becomes due.
 */
export async function evaluateAndClaimAlerts(config: AlertConfigState, db: AlertDb = getDb()): Promise<AlertEvaluation> {
  return db.transaction(async (tx) => {
    const [rawState] = await rows<StateRow>(
      tx,
      sql`select phase, generation, cycle_started_at, lease_token, lease_generation, lease_expires_at from moderation_alert_state where id = 1 for update`
    );
    if (!rawState) throw new Error("moderation_alert_state row is missing (migration 0030)");
    const state = normalizeState(rawState);
    // Read after the lock, so a run that waited on another one sees time move on.
    const [{ now: rawNow }] = await rows<{ now: unknown }>(tx, sql`select now() as now`);
    // Millisecond precision, the same as every timestamp this module writes back.
    const now = toDate(rawNow);
    const pending = await pendingReviewCount(tx);

    let cycle = cycleOf(state);
    let lease = leaseOf(state);
    let recipientRows =
      cycle.phase === "active"
        ? (await rows<RecipientRow>(tx, sql`select * from moderation_alert_recipients where generation = ${cycle.generation}`)).map(normalizeRecipient)
        : [];

    for (let step = 0; step < MAX_STEPS; step++) {
      const decision = decideModerationAlert({
        now,
        pendingReviewCount: pending,
        config,
        cycle,
        lease,
        recipients: recipientRows.map(toDeliveryState),
      });

      switch (decision.type) {
        case "START_CYCLE": {
          await tx.execute(
            sql`update moderation_alert_state set phase = 'active', generation = ${decision.generation}, cycle_started_at = ${ts(decision.startedAt)}::timestamptz, lease_token = null, lease_generation = null, lease_expires_at = null, updated_at = now() where id = 1`
          );
          cycle = { phase: "active", generation: decision.generation, startedAt: decision.startedAt };
          lease = null;
          recipientRows = [];
          continue;
        }
        case "RESET_CYCLE": {
          await tx.execute(
            sql`update moderation_alert_state set phase = 'idle', cycle_started_at = null, lease_token = null, lease_generation = null, lease_expires_at = null, updated_at = now() where id = 1`
          );
          // The finished cycle's bookkeeping is no longer read by anything.
          await tx.execute(sql`delete from moderation_alert_recipients where generation <= ${decision.generation}`);
          return { status: "idle", reason: "cycle-reset", nextDueAt: null, pendingReviewCount: pending };
        }
        case "NO_ACTION":
          return { status: "idle", reason: decision.reason, nextDueAt: decision.nextDueAt, pendingReviewCount: pending };
        default: {
          const leaseToken = randomToken();
          await tx.execute(
            sql`update moderation_alert_state set lease_token = ${leaseToken}, lease_generation = ${decision.generation}, lease_expires_at = ${ts(decision.leaseExpiresAt)}::timestamptz, updated_at = now() where id = 1`
          );
          const byHash = new Map(recipientRows.map((row) => [row.address_hash, row]));
          const sends: ClaimedSend[] = [];
          for (const send of decision.sends) {
            const previous = byHash.get(send.addressHash) ?? null;
            const claimed = claimedRecipientState(previous ? toDeliveryState(previous) : null, send, decision.generation, now);
            // A retry repeats its send exactly; a new send states the queue as it is now.
            const isRetry = send.kind === "retry" && previous !== null;
            const claimedCount = isRetry ? previous.claimed_count : Math.min(Math.max(pending, 1), MAX_ALERT_PENDING_COUNT);
            const templateKind = isRetry ? previous.template_kind : send.templateKind;
            await tx.execute(sql`
              insert into moderation_alert_recipients
                (generation, address_hash, send_sequence, template_kind, claimed_count, last_success_at, last_attempt_at,
                 consecutive_failures, in_flight, lease_token, next_attempt_at, updated_at)
              values
                (${decision.generation}, ${send.addressHash}, ${claimed.sendSequence}, ${templateKind}, ${claimedCount},
                 ${ts(claimed.lastSuccessAt)}::timestamptz, ${ts(claimed.lastAttemptAt)}::timestamptz, ${claimed.consecutiveFailures}, true, ${leaseToken}, null, now())
              on conflict (generation, address_hash) do update set
                send_sequence = excluded.send_sequence, template_kind = excluded.template_kind, claimed_count = excluded.claimed_count,
                last_success_at = excluded.last_success_at, last_attempt_at = excluded.last_attempt_at,
                consecutive_failures = excluded.consecutive_failures, in_flight = true, lease_token = excluded.lease_token,
                next_attempt_at = null, updated_at = now()
            `);
            sends.push({
              addressHash: send.addressHash,
              kind: send.kind,
              templateKind,
              sendSequence: claimed.sendSequence,
              idempotencyKey: send.idempotencyKey,
              claimedCount,
            });
          }
          return {
            status: "claimed",
            claim: { generation: decision.generation, leaseToken, leaseExpiresAt: decision.leaseExpiresAt, sends },
            pendingReviewCount: pending,
          };
        }
      }
    }
    throw new Error("moderation alert evaluation did not settle");
  });
}

/**
 * Records one send's outcome — only while the claim is still current
 * (fencing): same cycle generation, same lease token on the recipient row,
 * same send sequence, still in flight. Returns false for a stale completion,
 * which is discarded.
 */
export async function completeAlertSend(claim: AlertClaim, send: ClaimedSend, delivered: boolean, db: AlertDb = getDb()): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [rawState] = await rows<StateRow>(tx, sql`select phase, generation from moderation_alert_state where id = 1 for update`);
    const [rawRow] = await rows<RecipientRow>(
      tx,
      sql`select * from moderation_alert_recipients where generation = ${claim.generation} and address_hash = ${send.addressHash} for update`
    );
    const state = rawState ? { phase: rawState.phase, generation: Number(rawState.generation) } : null;
    const row = rawRow ? normalizeRecipient(rawRow) : null;
    if (!state || state.phase !== "active" || !row || !row.in_flight) return false;
    const current = { generation: state.generation, leaseToken: row.lease_token, sendSequence: row.send_sequence };
    if (!isCompletionCurrent({ generation: claim.generation, leaseToken: claim.leaseToken, sendSequence: send.sendSequence }, current)) return false;

    const next = applyDeliveryResult(toDeliveryState(row), delivered);
    await tx.execute(sql`
      update moderation_alert_recipients set
        in_flight = false, consecutive_failures = ${next.consecutiveFailures}, last_success_at = ${ts(next.lastSuccessAt)}::timestamptz,
        next_attempt_at = ${ts(nextDueAtFor(next))}::timestamptz, updated_at = now()
      where generation = ${claim.generation} and address_hash = ${send.addressHash} and lease_token = ${claim.leaseToken}
        and send_sequence = ${send.sendSequence} and in_flight
    `);
    return true;
  });
}

/** Gives the lease back early once every send of the claim is completed (only the holder's own token can). */
export async function releaseAlertLease(claim: AlertClaim, db: AlertDb = getDb()): Promise<boolean> {
  const result = await rows<{ id: number }>(
    db,
    sql`update moderation_alert_state set lease_token = null, lease_generation = null, lease_expires_at = null, updated_at = now() where id = 1 and lease_token = ${claim.leaseToken} returning id`
  );
  return result.length === 1;
}
