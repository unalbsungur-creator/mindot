import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";
import type { EmailService, SendEmailInput } from "@/features/email/types";
import { readModerationAlertConfig, type ModerationAlertRuntime } from "./config";
import { MIN_HASH_KEY_BYTES } from "./lib/addressHash";
import { completeAlertSend, evaluateAndClaimAlerts, releaseAlertLease, type AlertDb, type ClaimedSend } from "./repository";
import { runModerationAlerts } from "./service";
import { ALERT_FLAG_KEY, moderationAlertCronTick, parseAlertDueFlag, type AlertFlagKv } from "./cron";
import { runModerationAlertsAndRecord } from "./dueFlag";
import type { AlertConfigState } from "./types";

// MN-01 moderation alerts (migration 0030) against real PostgreSQL: the
// tables and their CHECKs, the single state row, the claim under concurrency
// (two Workers, one send), fencing of stale completions, retries that repeat
// the same email, and the cycle reset. Run through `npm run test:db:alerts`
// (throwaway Docker Postgres, URL in TOKEN_TEST_DATABASE_URL). Skipped without
// one; refuses any URL that isn't the local throwaway test database.

function localTestUrl(): string | null {
  const raw = process.env.TOKEN_TEST_DATABASE_URL;
  if (!raw) return null;
  const url = new URL(raw);
  if (url.hostname !== "127.0.0.1" || url.pathname !== "/mindot_token_test") {
    throw new Error("TOKEN_TEST_DATABASE_URL must point at the local mindot_token_test database");
  }
  return raw;
}

const TEST_URL = localTestUrl();

describe("moderation alerts on PostgreSQL", { skip: TEST_URL ? false : "TOKEN_TEST_DATABASE_URL is not set" }, () => {
  let sql: ReturnType<typeof postgres>;
  let workerA: AlertDb;
  let workerB: AlertDb;
  let clientA: ReturnType<typeof postgres>;
  let clientB: ReturnType<typeof postgres>;
  let runtime: ModerationAlertRuntime;
  let config: AlertConfigState;
  let authorId: string;

  before(async () => {
    delete process.env.APP_ENV;
    process.env.DATABASE_URL = TEST_URL!;
    sql = postgres(TEST_URL!, { max: 2, onnotice: () => {} });
    await migrate(drizzle(sql), { migrationsFolder: "drizzle" });
    // Two independent connection pools: two Workers racing for the same claim.
    clientA = postgres(TEST_URL!, { max: 2, onnotice: () => {} });
    clientB = postgres(TEST_URL!, { max: 2, onnotice: () => {} });
    workerA = drizzle(clientA, { schema }) as unknown as AlertDb;
    workerB = drizzle(clientB, { schema }) as unknown as AlertDb;
    runtime = await readModerationAlertConfig({
      NODE_ENV: "production",
      APP_ENV: "staging",
      AUTH_URL: "https://staging.mind-ot.com",
      MODERATION_ALERTS_ENABLED: "true",
      MODERATION_ALERT_RECIPIENTS: "contact@mind-ot.com, destek@mind-ot.com",
      MODERATION_ALERT_HASH_KEY: "k".repeat(MIN_HASH_KEY_BYTES),
      EMAIL_PROVIDER: "resend",
      RESEND_API_KEY: "re_test",
    });
    config = runtime.state;
    authorId = `user-${crypto.randomUUID()}`;
    await sql`insert into users (id, email, role, name) values (${authorId}, ${`${authorId}@example.test`}, 'user', 'Test Person')`;
  });

  after(async () => {
    await Promise.all([sql?.end({ timeout: 5 }), clientA?.end({ timeout: 5 }), clientB?.end({ timeout: 5 })]);
    await (globalThis as { mindotSql?: ReturnType<typeof postgres> }).mindotSql?.end({ timeout: 5 });
  });

  beforeEach(async () => {
    await sql`delete from messages`;
    await sql`delete from moderation_alert_recipients`;
    await sql`update moderation_alert_state set phase = 'idle', generation = 0, cycle_started_at = null, lease_token = null, lease_generation = null, lease_expires_at = null where id = 1`;
  });

  async function submitPending(count = 1) {
    for (let i = 0; i < count; i++) {
      await sql`insert into messages (id, content, author_id, author_name, is_anonymous, language, template_id, status, consent_accepted)
        values (${crypto.randomUUID()}, 'Bekleyen düşünce', ${authorId}, 'anonymous', true, 'tr', 'classic-yellow', 'pending', true)`;
    }
  }

  /** Moves this cycle's recorded attempt/success times back, as if `minutes` had passed. */
  async function ageAttempts(minutes: number) {
    const shift = `${minutes} minutes`;
    await sql`update moderation_alert_recipients set last_attempt_at = last_attempt_at - ${shift}::interval,
      last_success_at = last_success_at - ${shift}::interval`;
  }

  function recordingEmail(ok = true) {
    const sent: SendEmailInput[] = [];
    const email: EmailService = { send: async (input) => (sent.push(input), ok ? { ok: true } : { ok: false, reason: "resend-http-500" }) };
    return { sent, email };
  }

  it("creates the two tables, one idle state row, and no column that could hold an address", async () => {
    const [state] = await sql`select count(*)::int as rows, min(phase) as phase, min(generation)::int as generation from moderation_alert_state`;
    assert.deepEqual({ ...state }, { rows: 1, phase: "idle", generation: 0 });
    await assert.rejects(sql`insert into moderation_alert_state (id) values (2)`);
    await assert.rejects(
      sql`insert into moderation_alert_recipients (generation, address_hash, send_sequence, template_kind, claimed_count, last_attempt_at, in_flight, lease_token)
        values (1, 'destek@mind-ot.com', 1, 'initial', 1, now(), true, ${"t".repeat(32)})`,
      /moderation_alert_recipients_hash_check/
    );
    const columns = await sql`select column_name from information_schema.columns where table_name in ('moderation_alert_state', 'moderation_alert_recipients')`;
    assert.ok(columns.every((c) => !/mail|address(?!_hash)|recipient_email/.test(String(c.column_name))));
  });

  it("does nothing while the queue is empty", async () => {
    const result = await evaluateAndClaimAlerts(config, workerA);
    assert.deepEqual(result, { status: "idle", reason: "queue-empty", nextDueAt: null, pendingReviewCount: 0 });
  });

  it("starts a cycle and claims the first alert for every recipient, stating the queue size", async () => {
    await submitPending(3);
    const result = await evaluateAndClaimAlerts(config, workerA);
    assert.equal(result.status, "claimed");
    if (result.status !== "claimed") return;
    assert.equal(result.claim.generation, 1);
    assert.equal(result.claim.sends.length, 2);
    for (const send of result.claim.sends) {
      assert.equal(send.kind, "initial");
      assert.equal(send.claimedCount, 3);
      assert.match(send.idempotencyKey, /^mindot-modalert:staging:g1:[0-9a-f]{64}:s1$/);
    }
    const rows = await sql`select * from moderation_alert_recipients`;
    assert.equal(rows.length, 2);
    assert.ok(rows.every((row) => row.in_flight && row.lease_token === result.claim.leaseToken));
  });

  it("sends once when two Workers evaluate at the same moment (lease under the state row lock)", async () => {
    await submitPending(1);
    const [a, b] = await Promise.all([evaluateAndClaimAlerts(config, workerA), evaluateAndClaimAlerts(config, workerB)]);
    const claimed = [a, b].filter((r) => r.status === "claimed");
    const held = [a, b].filter((r) => r.status === "idle");
    assert.equal(claimed.length, 1);
    assert.equal(held.length, 1);
    assert.equal(held[0].status === "idle" && held[0].reason, "lease-held");
  });

  it("delivers each recipient exactly once across two concurrent full runs", async () => {
    await submitPending(2);
    const { sent, email } = recordingEmail();
    const evaluateOn = (db: AlertDb) => (state: AlertConfigState) => evaluateAndClaimAlerts(state, db);
    const [one, two] = await Promise.all([
      runModerationAlerts({ config: runtime, email, evaluate: evaluateOn(workerA), complete: (c, s, d) => completeAlertSend(c, s, d, workerA), release: (c) => releaseAlertLease(c, workerA) }),
      runModerationAlerts({ config: runtime, email, evaluate: evaluateOn(workerB), complete: (c, s, d) => completeAlertSend(c, s, d, workerB), release: (c) => releaseAlertLease(c, workerB) }),
    ]);
    assert.equal(sent.length, 2, "one email per recipient");
    assert.deepEqual(new Set(sent.map((m) => m.to)), new Set(["contact@mind-ot.com", "destek@mind-ot.com"]));
    assert.equal(one.delivered + two.delivered, 2);
    // Within 30 minutes nothing more is due, and the next reminder time is recorded.
    const again = await evaluateAndClaimAlerts(config, workerA);
    assert.equal(again.status === "idle" && again.reason, "nothing-due");
    const rows = await sql`select next_attempt_at - last_success_at as gap, in_flight from moderation_alert_recipients`;
    assert.ok(rows.every((row) => row.gap === "00:30:00" && !row.in_flight), JSON.stringify(rows));
  });

  it("retries a failed send with the same count, wording and idempotency key, on the 1 / 5 / 15 minute schedule", async () => {
    await submitPending(2);
    const first = await evaluateAndClaimAlerts(config, workerA);
    assert.equal(first.status, "claimed");
    if (first.status !== "claimed") return;
    for (const send of first.claim.sends) assert.ok(await completeAlertSend(first.claim, send, false, workerA));
    await releaseAlertLease(first.claim, workerA);

    // The queue grows meanwhile; the retry still states the claimed 2.
    await submitPending(5);
    const tooEarly = await evaluateAndClaimAlerts(config, workerA);
    assert.equal(tooEarly.status === "idle" && tooEarly.reason, "nothing-due");
    const [due] = await sql`select (min(next_attempt_at) - min(last_attempt_at))::text as wait from moderation_alert_recipients`;
    assert.equal(due.wait, "00:01:00", "first retry 1 minute after the failed attempt");

    await ageAttempts(1);
    const retry = await evaluateAndClaimAlerts(config, workerA);
    assert.equal(retry.status, "claimed");
    if (retry.status !== "claimed") return;
    for (const send of retry.claim.sends) {
      const original: ClaimedSend = first.claim.sends.find((s) => s.addressHash === send.addressHash)!;
      assert.equal(send.kind, "retry");
      assert.equal(send.claimedCount, 2);
      assert.equal(send.templateKind, original.templateKind);
      assert.equal(send.idempotencyKey, original.idempotencyKey);
    }
    for (const send of retry.claim.sends) await completeAlertSend(retry.claim, send, false, workerA);
    await releaseAlertLease(retry.claim, workerA);
    const [second] = await sql`select (min(next_attempt_at) - min(last_attempt_at))::text as wait, max(consecutive_failures)::int as failures from moderation_alert_recipients`;
    assert.deepEqual({ ...second }, { wait: "00:05:00", failures: 2 });
  });

  it("opens a new 30-minute window after four failed attempts, as a new send", async () => {
    await submitPending(1);
    let sequenceKey = "";
    for (let attempt = 1; attempt <= 4; attempt++) {
      const result = await evaluateAndClaimAlerts(config, workerA);
      assert.equal(result.status, "claimed", `attempt ${attempt}`);
      if (result.status !== "claimed") return;
      if (attempt === 1) sequenceKey = result.claim.sends[0].idempotencyKey;
      else assert.equal(result.claim.sends[0].idempotencyKey, sequenceKey, "still the same send");
      for (const send of result.claim.sends) await completeAlertSend(result.claim, send, false, workerA);
      await releaseAlertLease(result.claim, workerA);
      // Past the 1 / 5 / 15-minute retry waits.
      if (attempt < 4) await ageAttempts(15);
    }
    const [row] = await sql`select consecutive_failures::int as failures, (next_attempt_at - last_attempt_at)::text as wait from moderation_alert_recipients limit 1`;
    assert.deepEqual({ ...row }, { failures: 4, wait: "00:30:00" });
    await ageAttempts(29);
    const stillWaiting = await evaluateAndClaimAlerts(config, workerA);
    assert.equal(stillWaiting.status === "idle" && stillWaiting.reason, "nothing-due");
    await ageAttempts(1);
    const window = await evaluateAndClaimAlerts(config, workerA);
    assert.equal(window.status, "claimed");
    if (window.status !== "claimed") return;
    assert.equal(window.claim.sends[0].kind, "reminder");
    assert.notEqual(window.claim.sends[0].idempotencyKey, sequenceKey);
    assert.match(window.claim.sends[0].idempotencyKey, /:s2$/);
  });

  it("fences a sender whose lease expired and was re-claimed: its late completion is discarded", async () => {
    await submitPending(1);
    const stale = await evaluateAndClaimAlerts(config, workerA);
    assert.equal(stale.status, "claimed");
    if (stale.status !== "claimed") return;
    // The first sender hangs past its lease; a second evaluation recovers it.
    await sql`update moderation_alert_state set lease_expires_at = now() - interval '1 second'`;
    await ageAttempts(1);
    const fresh = await evaluateAndClaimAlerts(config, workerB);
    assert.equal(fresh.status, "claimed");
    if (fresh.status !== "claimed") return;
    assert.notEqual(fresh.claim.leaseToken, stale.claim.leaseToken);
    assert.equal(fresh.claim.sends[0].kind, "retry", "the abandoned attempt counts as a failure");

    assert.equal(await completeAlertSend(stale.claim, stale.claim.sends[0], true, workerA), false, "stale completion rejected");
    assert.equal(await releaseAlertLease(stale.claim, workerA), false, "a stale sender can't release the new lease");
    assert.equal(await completeAlertSend(fresh.claim, fresh.claim.sends[0], true, workerB), true);
  });

  it("resets the cycle once the queue is cleared, and starts a new generation on the next submission", async () => {
    await submitPending(1);
    const first = await evaluateAndClaimAlerts(config, workerA);
    assert.equal(first.status, "claimed");
    if (first.status !== "claimed") return;
    for (const send of first.claim.sends) await completeAlertSend(first.claim, send, true, workerA);
    await releaseAlertLease(first.claim, workerA);

    await sql`update messages set status = 'approved'`;
    const reset = await evaluateAndClaimAlerts(config, workerA);
    assert.equal(reset.status === "idle" && reset.reason, "cycle-reset");
    const [{ rows }] = await sql`select count(*)::int as rows from moderation_alert_recipients`;
    assert.equal(rows, 0);

    await submitPending(1);
    const next = await evaluateAndClaimAlerts(config, workerA);
    assert.equal(next.status === "claimed" && next.claim.generation, 2);
  });

  it("counts a pending revision of an approved card in the queue", async () => {
    await sql`insert into messages (id, content, author_id, author_name, is_anonymous, language, template_id, status, consent_accepted, pending_content)
      values (${crypto.randomUUID()}, 'Yayında', ${authorId}, 'anonymous', true, 'tr', 'classic-yellow', 'approved', true, 'Düzeltilmiş metin')`;
    const result = await evaluateAndClaimAlerts(config, workerA);
    assert.equal(result.pendingReviewCount, 1);
    assert.equal(result.status, "claimed");
  });

  it("starts the cycle but claims nothing while alerts are disabled", async () => {
    await submitPending(1);
    const result = await evaluateAndClaimAlerts({ status: "disabled", reason: "flag-off" }, workerA);
    assert.equal(result.status === "idle" && result.reason, "alerts-disabled");
    const [{ rows }] = await sql`select count(*)::int as rows from moderation_alert_recipients`;
    assert.equal(rows, 0);
  });

  it("event sends the first alert at once; the cron then wakes the database only when due, and never with an empty queue", async () => {
    const store = new Map<string, string>();
    const kv: AlertFlagKv = {
      get: async (key) => store.get(key) ?? null,
      put: async (key, value) => void store.set(key, value),
      delete: async (key) => void store.delete(key),
    };
    const { sent, email } = recordingEmail();
    let databaseRuns = 0;
    const run = () => {
      databaseRuns += 1;
      return runModerationAlertsAndRecord({
        config: runtime,
        email,
        kv,
        evaluate: (s) => evaluateAndClaimAlerts(s, workerA),
        complete: (c, s, d) => completeAlertSend(c, s, d, workerA),
        release: (c) => releaseAlertLease(c, workerA),
      });
    };

    // A card reaches an empty queue: the event run sends at once and flags the 30-minute reminder.
    await submitPending(1);
    await run();
    assert.equal(sent.length, 2);
    const due = parseAlertDueFlag(store.get(ALERT_FLAG_KEY) ?? null)!;
    assert.ok(due.getTime() - Date.now() > 29 * 60_000, "flag at the 30-minute reminder");

    // A second card within 30 minutes: no new email.
    await submitPending(1);
    await run();
    assert.equal(sent.length, 2);

    // Cron ticks before the reminder: KV only.
    for (let minute = 5; minute < 30; minute += 5) {
      assert.equal(await moderationAlertCronTick({ kv, now: new Date(Date.now() + minute * 60_000), invoke: async () => (await run(), true) }), "not-due");
    }
    const before = databaseRuns;

    // The admin clears the queue; at the flagged time the cron looks once, resets the cycle and clears the flag.
    await sql`update messages set status = 'approved'`;
    assert.equal(await moderationAlertCronTick({ kv, now: new Date(due.getTime() + 1000), invoke: async () => (await run(), true) }), "invoked");
    assert.equal(databaseRuns, before + 1);
    assert.equal(store.has(ALERT_FLAG_KEY), false);
    assert.equal(sent.length, 2, "no reminder for an empty queue");

    // From now on, with the queue empty, a whole day of ticks never reaches the database.
    for (let tick = 0; tick < 288; tick++) {
      assert.equal(await moderationAlertCronTick({ kv, now: new Date(due.getTime() + tick * 300_000), invoke: async () => (await run(), true) }), "no-flag");
    }
    assert.equal(databaseRuns, before + 1);
  });

  it("never stores an email address", async () => {
    await submitPending(1);
    const { email } = recordingEmail();
    await runModerationAlerts({ config: runtime, email, evaluate: (s) => evaluateAndClaimAlerts(s, workerA), complete: (c, s, d) => completeAlertSend(c, s, d, workerA), release: (c) => releaseAlertLease(c, workerA) });
    const dump = JSON.stringify([...(await sql`select * from moderation_alert_recipients`), ...(await sql`select * from moderation_alert_state`)]);
    assert.ok(!dump.includes("@"), "no address in either table");
  });
});
