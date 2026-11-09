import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LEASE_DURATION_MS,
  MAX_SEND_ATTEMPTS,
  REMINDER_INTERVAL_MS,
  type AlertConfigState,
  type AlertCycleState,
  type ModerationAlertDecision,
  type ModerationAlertInput,
  type RecipientDeliveryState,
} from "../types";
import {
  alertIdempotencyKey,
  applyDeliveryResult,
  claimedRecipientState,
  decideModerationAlert,
  isCompletionCurrent,
} from "./decideModerationAlert";

const T0 = new Date("2026-11-02T10:00:00.000Z");
const MIN = 60_000;
const at = (ms: number) => new Date(T0.getTime() + ms);

const HA = "a".repeat(64);
const HB = "b".repeat(64);
const HC = "c".repeat(64);

const enabled = (recipients: string[] = [HA, HB], environment: "production" | "staging" | "development" = "production"): AlertConfigState => ({
  status: "enabled",
  environment,
  recipients,
});
const active = (generation = 1): AlertCycleState => ({ phase: "active", generation, startedAt: T0 });

/** A completed, successful initial send at T0 unless overridden. */
function row(addressHash: string, overrides: Partial<RecipientDeliveryState> = {}): RecipientDeliveryState {
  return {
    addressHash,
    generation: 1,
    sendSequence: 1,
    lastSuccessAt: T0,
    lastAttemptAt: T0,
    consecutiveFailures: 0,
    inFlight: false,
    ...overrides,
  };
}

/** A send that has failed `failures` times, last attempt at `lastAttemptAt`, never succeeded. */
function failed(addressHash: string, failures: number, lastAttemptAt: Date = T0, overrides: Partial<RecipientDeliveryState> = {}) {
  return row(addressHash, { lastSuccessAt: null, lastAttemptAt, consecutiveFailures: failures, ...overrides });
}

function input(overrides: Partial<ModerationAlertInput> = {}): ModerationAlertInput {
  return {
    now: T0,
    pendingReviewCount: 1,
    config: enabled(),
    cycle: active(),
    lease: null,
    recipients: [],
    ...overrides,
  };
}

const key = (hash: string, seq: number, generation = 1, env: "production" | "staging" | "development" = "production") =>
  alertIdempotencyKey(env, generation, hash, seq);

function sendsOf(decision: ModerationAlertDecision) {
  assert.ok("sends" in decision, `expected a claim, got ${decision.type}`);
  return decision.sends;
}

describe("decideModerationAlert — empty queue and new cycles", () => {
  it("does nothing while the queue is empty and no cycle is running", () => {
    assert.deepEqual(decideModerationAlert(input({ pendingReviewCount: 0, cycle: { phase: "idle", generation: 0 } })), {
      type: "NO_ACTION",
      reason: "queue-empty",
      nextDueAt: null,
    });
  });

  it("0 → 1: starts generation 1 at `now`", () => {
    const decision = decideModerationAlert(input({ cycle: { phase: "idle", generation: 0 } }));
    assert.deepEqual(decision, { type: "START_CYCLE", generation: 1, startedAt: T0 });
  });

  it("always starts with the previous generation + 1", () => {
    assert.deepEqual(decideModerationAlert(input({ cycle: { phase: "idle", generation: 41 } })), {
      type: "START_CYCLE",
      generation: 42,
      startedAt: T0,
    });
  });

  it("starts a cycle even while alerts are disabled, so the cycle always mirrors the queue", () => {
    const decision = decideModerationAlert(
      input({ cycle: { phase: "idle", generation: 3 }, config: { status: "disabled", reason: "flag-off" } })
    );
    assert.equal(decision.type, "START_CYCLE");
  });

  it("a queue made only of pending revisions starts a cycle (the count is messages + revisions)", () => {
    const revisionsOnly = 0 /* pending messages */ + 1; /* pending revisions */
    assert.equal(
      decideModerationAlert(input({ pendingReviewCount: revisionsOnly, cycle: { phase: "idle", generation: 0 } })).type,
      "START_CYCLE"
    );
  });

  it("a reconsidered message refilling an empty queue starts a NEW generation", () => {
    const decision = decideModerationAlert(input({ pendingReviewCount: 1, cycle: { phase: "idle", generation: 7 } }));
    assert.deepEqual(decision, { type: "START_CYCLE", generation: 8, startedAt: T0 });
  });
});

describe("decideModerationAlert — reset and refill", () => {
  it("positive → 0 resets the active cycle", () => {
    assert.deepEqual(decideModerationAlert(input({ pendingReviewCount: 0, cycle: active(4) })), {
      type: "RESET_CYCLE",
      generation: 4,
    });
  });

  it("resets even under a live lease (a reset sends nothing; the sender's completion goes stale)", () => {
    const decision = decideModerationAlert(
      input({ pendingReviewCount: 0, lease: { generation: 1, expiresAt: at(30_000) } })
    );
    assert.deepEqual(decision, { type: "RESET_CYCLE", generation: 1 });
  });

  it("resets even when alerts are disabled", () => {
    const decision = decideModerationAlert(
      input({ pendingReviewCount: 0, config: { status: "disabled", reason: "no-recipients" } })
    );
    assert.equal(decision.type, "RESET_CYCLE");
  });

  it("empty → refill: old generation rows never suppress the new cycle's initial alerts", () => {
    const oldRows = [row(HA), row(HB)]; // generation 1, both notified
    assert.deepEqual(
      decideModerationAlert(input({ cycle: { phase: "idle", generation: 1 }, recipients: oldRows })),
      { type: "START_CYCLE", generation: 2, startedAt: T0 }
    );

    const decision = decideModerationAlert(input({ cycle: active(2), recipients: oldRows, now: at(MIN) }));
    assert.equal(decision.type, "CLAIM_INITIAL");
    assert.deepEqual(
      sendsOf(decision).map((s) => [s.addressHash, s.sendSequence, s.idempotencyKey]),
      [
        [HA, 1, key(HA, 1, 2)],
        [HB, 1, key(HB, 1, 2)],
      ]
    );
  });
});

describe("decideModerationAlert — initial claims", () => {
  it("claims one initial send per configured recipient, sorted, with a 60 s lease", () => {
    const decision = decideModerationAlert(input({ config: enabled([HB, HA]) }));
    assert.deepEqual(decision, {
      type: "CLAIM_INITIAL",
      generation: 1,
      leaseExpiresAt: at(LEASE_DURATION_MS),
      sends: [
        { addressHash: HA, kind: "initial", templateKind: "initial", sendSequence: 1, idempotencyKey: key(HA, 1) },
        { addressHash: HB, kind: "initial", templateKind: "initial", sendSequence: 1, idempotencyKey: key(HB, 1) },
      ],
    });
  });

  it("generates the initial send only once per recipient per generation", () => {
    const decision = decideModerationAlert(input({ recipients: [row(HA), row(HB)], now: at(MIN) }));
    assert.equal(decision.type, "NO_ACTION");
  });

  it("1 → N growth sends nothing new: each recipient keeps its own 30-minute clock", () => {
    const decision = decideModerationAlert(
      input({ pendingReviewCount: 7, recipients: [row(HA), row(HB)], now: at(5 * MIN) })
    );
    assert.deepEqual(decision, { type: "NO_ACTION", reason: "nothing-due", nextDueAt: at(30 * MIN) });
  });
});

describe("decideModerationAlert — 30-minute reminders", () => {
  const rows = [row(HA), row(HB)];

  it("is not due at 29:59.999", () => {
    assert.deepEqual(decideModerationAlert(input({ recipients: rows, now: at(REMINDER_INTERVAL_MS - 1) })), {
      type: "NO_ACTION",
      reason: "nothing-due",
      nextDueAt: at(REMINDER_INTERVAL_MS),
    });
  });

  it("is due at exactly 30:00.000 with a new sequence and a new key", () => {
    const decision = decideModerationAlert(input({ recipients: rows, now: at(REMINDER_INTERVAL_MS) }));
    assert.equal(decision.type, "CLAIM_REMINDER");
    const sends = sendsOf(decision);
    assert.deepEqual(
      sends.map((s) => [s.addressHash, s.kind, s.templateKind, s.sendSequence, s.idempotencyKey]),
      [
        [HA, "reminder", "reminder", 2, key(HA, 2)],
        [HB, "reminder", "reminder", 2, key(HB, 2)],
      ]
    );
    assert.notEqual(sends[0].idempotencyKey, key(HA, 1));
  });

  it("is due after 30:00.001 too", () => {
    assert.equal(
      decideModerationAlert(input({ recipients: rows, now: at(REMINDER_INTERVAL_MS + 1) })).type,
      "CLAIM_REMINDER"
    );
  });

  it("clocks are per recipient: only the recipient whose 30 minutes passed is reminded", () => {
    const decision = decideModerationAlert(
      input({ recipients: [row(HA), row(HB, { lastSuccessAt: at(10 * MIN), lastAttemptAt: at(10 * MIN) })], now: at(30 * MIN) })
    );
    assert.deepEqual(sendsOf(decision).map((s) => s.addressHash), [HA]);
  });

  it("never reminds while the queue is empty (the cycle resets instead)", () => {
    assert.equal(
      decideModerationAlert(input({ pendingReviewCount: 0, recipients: rows, now: at(60 * MIN) })).type,
      "RESET_CYCLE"
    );
  });
});

describe("decideModerationAlert — partial success and the retry ladder", () => {
  it("partial success: only the failed recipient is retried, with its original sequence and key", () => {
    const recipients = [row(HA), failed(HB, 1)];
    const decision = decideModerationAlert(input({ recipients, now: at(MIN) }));
    assert.deepEqual(decision, {
      type: "RETRY_RECIPIENT",
      generation: 1,
      leaseExpiresAt: at(MIN + LEASE_DURATION_MS),
      sends: [{ addressHash: HB, kind: "retry", templateKind: "initial", sendSequence: 1, idempotencyKey: key(HB, 1) }],
    });
  });

  for (const [failures, delayMin] of [
    [1, 1],
    [2, 5],
    [3, 15],
  ] as const) {
    it(`after failure ${failures} the retry is due at +${delayMin} min, not 1 ms earlier`, () => {
      const recipients = [failed(HA, failures)];
      const config = enabled([HA]);
      assert.deepEqual(decideModerationAlert(input({ config, recipients, now: at(delayMin * MIN - 1) })), {
        type: "NO_ACTION",
        reason: "nothing-due",
        nextDueAt: at(delayMin * MIN),
      });
      const decision = decideModerationAlert(input({ config, recipients, now: at(delayMin * MIN) }));
      assert.equal(decision.type, "RETRY_RECIPIENT");
      assert.deepEqual(sendsOf(decision)[0], {
        addressHash: HA,
        kind: "retry",
        templateKind: "initial",
        sendSequence: 1,
        idempotencyKey: key(HA, 1),
      });
    });
  }

  it(`after ${MAX_SEND_ATTEMPTS} failed attempts no retry follows the ladder; a fresh window opens 30 min after the last attempt`, () => {
    const config = enabled([HA]);
    const recipients = [failed(HA, MAX_SEND_ATTEMPTS, at(21 * MIN))];
    assert.deepEqual(decideModerationAlert(input({ config, recipients, now: at(36 * MIN) })), {
      type: "NO_ACTION",
      reason: "nothing-due",
      nextDueAt: at(51 * MIN),
    });
    assert.equal(decideModerationAlert(input({ config, recipients, now: at(51 * MIN - 1) })).type, "NO_ACTION");

    const decision = decideModerationAlert(input({ config, recipients, now: at(51 * MIN) }));
    assert.equal(decision.type, "CLAIM_REMINDER");
    // A never-notified recipient still gets the initial wording, under a NEW sequence and key.
    assert.deepEqual(sendsOf(decision)[0], {
      addressHash: HA,
      kind: "reminder",
      templateKind: "initial",
      sendSequence: 2,
      idempotencyKey: key(HA, 2),
    });
  });
});

describe("decideModerationAlert — the successful-send 30-minute minimum is never bypassed", () => {
  it("a retry of a recipient with a recent success waits for lastSuccessAt + 30 min, not the 1-minute ladder", () => {
    const config = enabled([HA]);
    const recipients = [row(HA, { consecutiveFailures: 1, lastSuccessAt: T0, lastAttemptAt: T0 })];
    assert.deepEqual(decideModerationAlert(input({ config, recipients, now: at(MIN) })), {
      type: "NO_ACTION",
      reason: "nothing-due",
      nextDueAt: at(30 * MIN),
    });
    assert.equal(decideModerationAlert(input({ config, recipients, now: at(30 * MIN - 1) })).type, "NO_ACTION");
    const decision = decideModerationAlert(input({ config, recipients, now: at(30 * MIN) }));
    assert.equal(decision.type, "RETRY_RECIPIENT");
    assert.equal(sendsOf(decision)[0].templateKind, "reminder");
  });

  it("an exhausted reminder opens its fresh window no earlier than both last attempt + 30 and last success + 30", () => {
    const config = enabled([HA]);
    // Success at T0, reminder (seq 2) claimed at +30 failed 4 times, last at +51.
    const recipients = [
      row(HA, { sendSequence: 2, lastSuccessAt: T0, lastAttemptAt: at(51 * MIN), consecutiveFailures: MAX_SEND_ATTEMPTS }),
    ];
    assert.deepEqual(decideModerationAlert(input({ config, recipients, now: at(80 * MIN) })), {
      type: "NO_ACTION",
      reason: "nothing-due",
      nextDueAt: at(81 * MIN),
    });
    const decision = decideModerationAlert(input({ config, recipients, now: at(81 * MIN) }));
    assert.deepEqual(sendsOf(decision)[0], {
      addressHash: HA,
      kind: "reminder",
      templateKind: "reminder",
      sendSequence: 3,
      idempotencyKey: key(HA, 3),
    });
  });

  it("an abandoned in-flight attempt of a recently-notified recipient still waits for the success floor", () => {
    const config = enabled([HA]);
    const recipients = [row(HA, { inFlight: true, lastSuccessAt: T0, lastAttemptAt: T0 })];
    assert.deepEqual(decideModerationAlert(input({ config, recipients, now: at(2 * MIN) })), {
      type: "NO_ACTION",
      reason: "nothing-due",
      nextDueAt: at(30 * MIN),
    });
  });

  it("no decision ever schedules a send to a notified recipient before lastSuccessAt + 30 min", () => {
    const config = enabled([HA]);
    const success = at(5 * MIN);
    for (let failures = 0; failures <= MAX_SEND_ATTEMPTS; failures++) {
      for (const inFlight of failures < MAX_SEND_ATTEMPTS ? [false, true] : [false]) {
        const recipients = [row(HA, { lastSuccessAt: success, lastAttemptAt: success, consecutiveFailures: failures, inFlight })];
        for (let minute = 5; minute < 35; minute++) {
          const decision = decideModerationAlert(input({ config, recipients, now: at(minute * MIN) }));
          assert.equal(decision.type, "NO_ACTION", `failures=${failures} inFlight=${inFlight} minute=${minute}`);
        }
        assert.notEqual(decideModerationAlert(input({ config, recipients, now: at(35 * MIN) })).type, "NO_ACTION");
      }
    }
  });
});

describe("decideModerationAlert — claim priority", () => {
  it("initial before retry before reminder; each decision batches one kind", () => {
    const config = enabled([HA, HB, HC]);
    const retryDue = failed(HB, 1);
    const reminderDue = row(HC);
    const now = at(30 * MIN);

    const first = decideModerationAlert(input({ config, recipients: [retryDue, reminderDue], now }));
    assert.equal(first.type, "CLAIM_INITIAL");
    assert.deepEqual(sendsOf(first).map((s) => s.addressHash), [HA]);

    const second = decideModerationAlert(input({ config, recipients: [row(HA, { lastSuccessAt: now, lastAttemptAt: now }), retryDue, reminderDue], now }));
    assert.equal(second.type, "RETRY_RECIPIENT");
    assert.deepEqual(sendsOf(second).map((s) => s.addressHash), [HB]);

    const third = decideModerationAlert(
      input({ config, recipients: [row(HA, { lastSuccessAt: now, lastAttemptAt: now }), row(HB, { lastSuccessAt: now, lastAttemptAt: now }), reminderDue], now })
    );
    assert.equal(third.type, "CLAIM_REMINDER");
    assert.deepEqual(sendsOf(third).map((s) => s.addressHash), [HC]);
  });
});

describe("decideModerationAlert — leases", () => {
  const lease = { generation: 1, expiresAt: at(LEASE_DURATION_MS) };

  it("a live lease of this generation blocks competing claims", () => {
    assert.deepEqual(decideModerationAlert(input({ lease, now: at(LEASE_DURATION_MS - 1) })), {
      type: "NO_ACTION",
      reason: "lease-held",
      nextDueAt: at(LEASE_DURATION_MS),
    });
  });

  it("the lease is expired at exactly expiresAt, so recovery may claim", () => {
    assert.equal(decideModerationAlert(input({ lease, now: at(LEASE_DURATION_MS) })).type, "CLAIM_INITIAL");
  });

  it("a lease left over from another generation is ignored", () => {
    const decision = decideModerationAlert(input({ cycle: active(2), lease: { generation: 1, expiresAt: at(10 * MIN) } }));
    assert.equal(decision.type, "CLAIM_INITIAL");
  });

  it("recovery: an attempt still in flight after its lease expired counts as failed and is retried with the same key", () => {
    const config = enabled([HA]);
    const recipients = [failed(HA, 0, T0, { inFlight: true })];
    assert.deepEqual(decideModerationAlert(input({ config, recipients, lease, now: at(MIN - 1) })), {
      type: "NO_ACTION",
      reason: "lease-held",
      nextDueAt: at(LEASE_DURATION_MS),
    });
    const decision = decideModerationAlert(input({ config, recipients, lease, now: at(MIN) }));
    assert.equal(decision.type, "RETRY_RECIPIENT");
    assert.deepEqual(sendsOf(decision)[0], {
      addressHash: HA,
      kind: "retry",
      templateKind: "initial",
      sendSequence: 1,
      idempotencyKey: key(HA, 1),
    });
  });

  it("an abandoned in-flight 4th attempt is treated as exhausted", () => {
    const config = enabled([HA]);
    const recipients = [failed(HA, MAX_SEND_ATTEMPTS - 1, T0, { inFlight: true })];
    assert.deepEqual(decideModerationAlert(input({ config, recipients, now: at(29 * MIN) })), {
      type: "NO_ACTION",
      reason: "nothing-due",
      nextDueAt: at(30 * MIN),
    });
  });
});

describe("decideModerationAlert — recipient list changes", () => {
  it("a recipient added mid-cycle gets its initial notification; the others are untouched", () => {
    const decision = decideModerationAlert(
      input({ config: enabled([HA, HB, HC]), recipients: [row(HA), row(HB)], now: at(5 * MIN) })
    );
    assert.equal(decision.type, "CLAIM_INITIAL");
    assert.deepEqual(sendsOf(decision).map((s) => [s.addressHash, s.sendSequence]), [[HC, 1]]);
  });

  it("a removed recipient's rows are ignored, even when a retry would be due", () => {
    const decision = decideModerationAlert(
      input({ config: enabled([HA]), recipients: [row(HA), failed(HB, 1)], now: at(10 * MIN) })
    );
    assert.deepEqual(decision, { type: "NO_ACTION", reason: "nothing-due", nextDueAt: at(30 * MIN) });
  });
});

describe("decideModerationAlert — disabled configuration", () => {
  for (const reason of [
    "flag-off",
    "no-recipients",
    "invalid-recipient",
    "too-many-recipients",
    "provider-not-configured",
    "hash-key-missing",
  ] as const) {
    it(`claims nothing while disabled (${reason})`, () => {
      assert.deepEqual(
        decideModerationAlert(input({ config: { status: "disabled", reason }, recipients: [failed(HA, 1)], now: at(60 * MIN) })),
        { type: "NO_ACTION", reason: "alerts-disabled", nextDueAt: null }
      );
    });
  }

  it("re-enabling mid-cycle sends the initial alert right away", () => {
    assert.equal(decideModerationAlert(input({ now: at(45 * MIN) })).type, "CLAIM_INITIAL");
  });
});

describe("decideModerationAlert — invalid input fails closed", () => {
  const INVALID = { type: "NO_ACTION", reason: "invalid-input", nextDueAt: null };
  const cases: [string, Partial<ModerationAlertInput>][] = [
    ["invalid now", { now: new Date(Number.NaN) }],
    ["now not a Date", { now: "2026-11-02T10:00:00Z" as unknown as Date }],
    ["negative count", { pendingReviewCount: -1 }],
    ["fractional count", { pendingReviewCount: 1.5 }],
    ["NaN count", { pendingReviewCount: Number.NaN }],
    ["string count", { pendingReviewCount: "1" as unknown as number }],
    ["negative idle generation", { cycle: { phase: "idle", generation: -1 } }],
    ["active generation 0", { cycle: { phase: "active", generation: 0, startedAt: T0 } }],
    ["active with invalid startedAt", { cycle: { phase: "active", generation: 1, startedAt: new Date("x") } }],
    ["unknown phase", { cycle: { phase: "paused", generation: 1 } as unknown as AlertCycleState }],
    ["lease with invalid expiry", { lease: { generation: 1, expiresAt: new Date("x") } }],
    ["enabled with no recipients", { config: enabled([]) }],
    ["enabled with 6 recipients", { config: enabled(["1", "2", "3", "4", "5", "6"].map((d) => d.repeat(64))) }],
    ["duplicate configured hash", { config: enabled([HA, HA]) }],
    ["uppercase hash", { config: enabled(["A".repeat(64)]) }],
    ["short hash", { config: enabled(["a".repeat(63)]) }],
    ["raw address instead of hash", { config: enabled(["admin@example.com"]) }],
    ["unknown environment", { config: { status: "enabled", environment: "prod", recipients: [HA] } as unknown as AlertConfigState }],
    ["unknown disabled reason", { config: { status: "disabled", reason: "maybe" } as unknown as AlertConfigState }],
    ["recipients not an array", { recipients: null as unknown as RecipientDeliveryState[] }],
    ["row with a bad hash", { recipients: [row("z".repeat(64))] }],
    ["row with generation 0", { recipients: [row(HA, { generation: 0 })] }],
    ["row with sequence 0", { recipients: [row(HA, { sendSequence: 0 })] }],
    ["row with too many failures", { recipients: [failed(HA, MAX_SEND_ATTEMPTS + 1)] }],
    ["row in flight while exhausted", { recipients: [failed(HA, MAX_SEND_ATTEMPTS, T0, { inFlight: true })] }],
    ["row without an attempt time", { recipients: [row(HA, { lastAttemptAt: null })] }],
    ["row whose success is after its last attempt", { recipients: [row(HA, { lastSuccessAt: at(MIN) })] }],
    ["completed row with neither success nor failure", { recipients: [failed(HA, 0)] }],
    ["duplicate rows for one recipient and generation", { recipients: [row(HA), row(HA)] }],
  ];
  for (const [name, overrides] of cases) {
    it(name, () => assert.deepEqual(decideModerationAlert(input(overrides)), INVALID));
  }

  it("an invalid row blocks even a reset (nothing is trusted from a corrupt snapshot)", () => {
    assert.deepEqual(decideModerationAlert(input({ pendingReviewCount: 0, recipients: [failed(HA, 0)] })), INVALID);
  });
});

describe("decideModerationAlert — determinism and immutability", () => {
  const snapshot = (): ModerationAlertInput =>
    input({
      config: enabled([HC, HA, HB]),
      recipients: [row(HA), failed(HB, 2, at(10 * MIN)), row(HC, { generation: 0 + 1, sendSequence: 3 })],
      lease: { generation: 1, expiresAt: at(MIN) },
      now: at(31 * MIN),
    });

  it("returns deep-equal decisions for equal input", () => {
    assert.deepEqual(decideModerationAlert(snapshot()), decideModerationAlert(snapshot()));
  });

  it("does not mutate its input", () => {
    const value = snapshot();
    const before = structuredClone(value);
    const configOrder = [...(value.config as { recipients: readonly string[] }).recipients];
    decideModerationAlert(value);
    assert.deepEqual(value, before);
    assert.deepEqual((value.config as { recipients: readonly string[] }).recipients, configOrder);
  });

  it("works on frozen input", () => {
    const value = snapshot();
    for (const r of value.recipients) Object.freeze(r);
    Object.freeze(value.recipients);
    Object.freeze((value.config as { recipients: readonly string[] }).recipients);
    Object.freeze(value.config);
    Object.freeze(value);
    assert.doesNotThrow(() => decideModerationAlert(value));
  });

  it("never returns an input Date object (callers may mutate results safely)", () => {
    const start = input({ cycle: { phase: "idle", generation: 0 } });
    const started = decideModerationAlert(start);
    assert.ok(started.type === "START_CYCLE" && started.startedAt !== start.now);

    const held = input({ lease: { generation: 1, expiresAt: at(MIN) } });
    const decision = decideModerationAlert(held);
    assert.ok(decision.type === "NO_ACTION" && decision.nextDueAt !== held.lease?.expiresAt);
  });
});

describe("alertIdempotencyKey", () => {
  it("is stable for the same send", () => {
    assert.equal(key(HA, 1), key(HA, 1));
    assert.equal(key(HA, 1), `mindot-modalert:production:g1:${HA}:s1`);
  });

  it("differs across generation, sequence, recipient and environment", () => {
    const keys = new Set([key(HA, 1), key(HA, 2), key(HA, 1, 2), key(HB, 1), key(HA, 1, 1, "staging"), key(HA, 1, 1, "development")]);
    assert.equal(keys.size, 6);
  });

  it("contains only the hash, never an address", () => {
    assert.ok(!key(HA, 1).includes("@"));
  });

  it("refuses invalid parts", () => {
    assert.throws(() => alertIdempotencyKey("production", 0, HA, 1), RangeError);
    assert.throws(() => alertIdempotencyKey("production", 1, "admin@example.com", 1), RangeError);
    assert.throws(() => alertIdempotencyKey("production", 1, HA, 0), RangeError);
    assert.throws(() => alertIdempotencyKey("prod" as "production", 1, HA, 1), RangeError);
  });
});

describe("claim / completion helpers", () => {
  it("full lifecycle: initial fails, retry keeps the key, success anchors the reminder clock", () => {
    const config = enabled([HA]);

    const initial = decideModerationAlert(input({ config }));
    const initialSend = sendsOf(initial)[0];
    let state = claimedRecipientState(null, initialSend, 1, T0);
    assert.deepEqual(state, row(HA, { lastSuccessAt: null, inFlight: true }));

    state = applyDeliveryResult(state, false);
    assert.deepEqual(state, failed(HA, 1));

    const retry = decideModerationAlert(input({ config, recipients: [state], now: at(MIN) }));
    const retrySend = sendsOf(retry)[0];
    assert.equal(retrySend.idempotencyKey, initialSend.idempotencyKey);
    state = claimedRecipientState(state, retrySend, 1, at(MIN));
    assert.equal(state.consecutiveFailures, 1);

    state = applyDeliveryResult(state, true);
    assert.deepEqual(state, row(HA, { lastSuccessAt: at(MIN), lastAttemptAt: at(MIN) }));

    assert.equal(decideModerationAlert(input({ config, recipients: [state], now: at(31 * MIN - 1) })).type, "NO_ACTION");
    const reminder = decideModerationAlert(input({ config, recipients: [state], now: at(31 * MIN) }));
    assert.equal(reminder.type, "CLAIM_REMINDER");
    const reminderState = claimedRecipientState(state, sendsOf(reminder)[0], 1, at(31 * MIN));
    assert.deepEqual(reminderState, row(HA, { sendSequence: 2, lastSuccessAt: at(MIN), lastAttemptAt: at(31 * MIN), inFlight: true }));
  });

  it("re-claiming an abandoned in-flight attempt counts it as a failure", () => {
    const abandoned = failed(HA, 1, T0, { inFlight: true });
    const reclaimed = claimedRecipientState(abandoned, { addressHash: HA, kind: "retry", sendSequence: 1 }, 1, at(5 * MIN));
    assert.equal(reclaimed.consecutiveFailures, 2);
  });

  it("does not mutate the previous row", () => {
    const previous = Object.freeze(failed(HA, 1));
    const next = claimedRecipientState(previous, { addressHash: HA, kind: "retry", sendSequence: 1 }, 1, at(MIN));
    assert.notEqual(next, previous);
    assert.deepEqual(previous, failed(HA, 1));
  });

  it("refuses impossible transitions", () => {
    assert.throws(() => claimedRecipientState(null, { addressHash: HA, kind: "retry", sendSequence: 1 }, 1, T0), RangeError);
    assert.throws(() => claimedRecipientState(null, { addressHash: HA, kind: "initial", sendSequence: 1 }, 1, new Date("x")), RangeError);
    assert.throws(() => applyDeliveryResult(row(HA), true), RangeError);
  });
});

describe("isCompletionCurrent — stale completions", () => {
  const claimed = { generation: 3, leaseToken: "lease-token-1", sendSequence: 2 };

  it("accepts a completion that still matches generation, lease and sequence", () => {
    assert.equal(isCompletionCurrent(claimed, { ...claimed }), true);
  });

  it("rejects after a reset (no current row), a new generation, a re-claim or an advanced sequence", () => {
    assert.equal(isCompletionCurrent(claimed, null), false);
    assert.equal(isCompletionCurrent(claimed, { ...claimed, generation: 4 }), false);
    assert.equal(isCompletionCurrent(claimed, { ...claimed, leaseToken: "lease-token-2" }), false);
    assert.equal(isCompletionCurrent(claimed, { ...claimed, sendSequence: 3 }), false);
  });

  it("never accepts an empty lease token", () => {
    const empty = { ...claimed, leaseToken: "" };
    assert.equal(isCompletionCurrent(empty, { ...empty }), false);
  });
});
