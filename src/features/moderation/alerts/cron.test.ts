import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ALERT_FLAG_KEY, moderationAlertCronTick, parseAlertDueFlag, type AlertFlagKv } from "./cron";
import { CRON_SECRET_HEADER, isAuthorizedCronRequest, MIN_CRON_SECRET_LENGTH } from "./cronAuth";
import { alertFlagAfterRun, recordAlertFlag, runModerationAlertsAndRecord } from "./dueFlag";
import type { AlertRunSummary } from "./service";
import { scheduleModerationAlert } from "./trigger";

const NOW = new Date("2026-11-09T12:00:00.000Z");

function memoryKv(initial?: string): AlertFlagKv & { value: string | null; reads: number; writes: number } {
  const kv = {
    value: initial ?? null,
    reads: 0,
    writes: 0,
    async get(key: string) {
      assert.equal(key, ALERT_FLAG_KEY);
      kv.reads += 1;
      return kv.value;
    },
    async put(key: string, value: string) {
      assert.equal(key, ALERT_FLAG_KEY);
      kv.writes += 1;
      kv.value = value;
    },
    async delete(key: string) {
      assert.equal(key, ALERT_FLAG_KEY);
      kv.writes += 1;
      kv.value = null;
    },
  };
  return kv;
}

/** An invoke that fails the test if the cron would have reached the database. */
const mustNotInvoke = async (): Promise<boolean> => {
  throw new assert.AssertionError({ message: "the cron reached the database" });
};

function summary(overrides: Partial<AlertRunSummary>): AlertRunSummary {
  return { status: "idle", attempted: 0, delivered: 0, failed: 0, stale: 0, nextDueAt: null, pendingReviewCount: 0, ...overrides };
}

describe("the cron tick (no database unless something is due)", () => {
  it("does not reach the database when there is no flag — an empty queue", async () => {
    const kv = memoryKv();
    assert.equal(await moderationAlertCronTick({ kv, now: NOW, invoke: mustNotInvoke }), "no-flag");
    assert.equal(kv.reads, 1, "one KV read, nothing else");
  });

  it("does not reach the database without the KV binding", async () => {
    assert.equal(await moderationAlertCronTick({ kv: undefined, now: NOW, invoke: mustNotInvoke }), "no-kv");
  });

  it("does not reach the database before the flagged time", async () => {
    const kv = memoryKv(JSON.stringify({ dueAt: "2026-11-09T12:00:00.001Z" }));
    assert.equal(await moderationAlertCronTick({ kv, now: NOW, invoke: mustNotInvoke }), "not-due");
  });

  it("runs the evaluation once the flagged time has come (inclusive)", async () => {
    let calls = 0;
    const invoke = async () => (calls++, true);
    assert.equal(await moderationAlertCronTick({ kv: memoryKv(JSON.stringify({ dueAt: NOW.toISOString() })), now: NOW, invoke }), "invoked");
    assert.equal(calls, 1);
  });

  it("treats an unreadable flag as due (the run rewrites it) and survives a failing run", async () => {
    assert.equal(parseAlertDueFlag("not json"), null);
    assert.equal(await moderationAlertCronTick({ kv: memoryKv("not json"), now: NOW, invoke: async () => true }), "invoked");
    assert.equal(await moderationAlertCronTick({ kv: memoryKv("{}"), now: NOW, invoke: async () => Promise.reject(new Error("down")) }), "invoke-failed");
  });
});

describe("the flag a run leaves behind", () => {
  it("clears it when the queue is empty or alerts are off", () => {
    assert.deepEqual(alertFlagAfterRun(summary({ reason: "cycle-reset", pendingReviewCount: 0 }), NOW), { action: "delete" });
    assert.deepEqual(alertFlagAfterRun(summary({ reason: "queue-empty", pendingReviewCount: 0 }), NOW), { action: "delete" });
    assert.deepEqual(alertFlagAfterRun(summary({ status: "disabled", reason: "alerts-disabled", pendingReviewCount: 4 }), NOW), { action: "delete" });
  });

  it("sets it to the next reminder or retry", () => {
    const reminder = new Date("2026-11-09T12:30:00.000Z");
    assert.deepEqual(alertFlagAfterRun(summary({ status: "sent", delivered: 1, attempted: 1, nextDueAt: reminder, pendingReviewCount: 2 }), NOW), { action: "put", dueAt: reminder });
    const retry = new Date("2026-11-09T12:01:00.000Z");
    assert.deepEqual(alertFlagAfterRun(summary({ status: "sent", failed: 1, attempted: 1, nextDueAt: retry, pendingReviewCount: 2 }), NOW), { action: "put", dueAt: retry });
  });

  it("asks for another look on the next tick after an error", () => {
    assert.deepEqual(alertFlagAfterRun(summary({ status: "error", pendingReviewCount: null }), NOW), { action: "put", dueAt: NOW });
  });

  it("never drops reminders while the queue is non-empty", () => {
    assert.deepEqual(alertFlagAfterRun(summary({ reason: "nothing-due", pendingReviewCount: 3, nextDueAt: null }), NOW), {
      action: "put",
      dueAt: new Date("2026-11-09T12:30:00.000Z"),
    });
  });

  it("is written as the ISO time the cron reads back", async () => {
    const kv = memoryKv();
    await recordAlertFlag(kv, { action: "put", dueAt: new Date("2026-11-09T12:30:00.000Z") });
    assert.deepEqual(parseAlertDueFlag(kv.value), new Date("2026-11-09T12:30:00.000Z"));
    await recordAlertFlag(kv, { action: "delete" });
    assert.equal(kv.value, null);
    await recordAlertFlag(null, { action: "delete" });
  });

  it("an empty queue after a run means the following ticks never query", async () => {
    const kv = memoryKv(JSON.stringify({ dueAt: NOW.toISOString() }));
    await runModerationAlertsAndRecord({
      kv,
      now: () => NOW,
      evaluate: async () => ({ status: "idle", reason: "cycle-reset", nextDueAt: null, pendingReviewCount: 0 }),
    });
    assert.equal(kv.value, null);
    for (let tick = 0; tick < 12; tick++) {
      assert.equal(await moderationAlertCronTick({ kv, now: new Date(NOW.getTime() + tick * 300_000), invoke: mustNotInvoke }), "no-flag");
    }
  });
});

describe("the internal route's cron secret", () => {
  const SECRET = "s".repeat(MIN_CRON_SECRET_LENGTH);
  it("accepts only the exact secret", () => {
    assert.equal(CRON_SECRET_HEADER, "x-mindot-cron");
    assert.equal(isAuthorizedCronRequest(SECRET, SECRET), true);
    assert.equal(isAuthorizedCronRequest(`${SECRET}x`, SECRET), false);
    assert.equal(isAuthorizedCronRequest(SECRET.slice(1), SECRET), false);
    assert.equal(isAuthorizedCronRequest(null, SECRET), false);
  });

  it("is closed while the secret is missing or short", () => {
    assert.equal(isAuthorizedCronRequest("", ""), false);
    assert.equal(isAuthorizedCronRequest("short", "short"), false);
    assert.equal(isAuthorizedCronRequest("anything", undefined), false);
  });
});

describe("the event trigger", () => {
  it("never throws to the caller — outside a request it simply does nothing", () => {
    assert.doesNotThrow(() => scheduleModerationAlert());
  });
});
