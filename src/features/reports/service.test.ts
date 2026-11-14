import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ANONYMOUS_REPORTS_PER_HOUR, type ReportLimitKv } from "./lib/anonymousReportLimits";
import { reportMessageAsReporter, type AnonymousReportGate, type ReportMessageDeps, type ReportMessageParams } from "./service";
import type { MessageReport, NewReportInput, ReportReason } from "./types";

interface FakeOptions {
  recentCount?: number;
  messageExists?: boolean;
  duplicate?: boolean;
}

function fakeDeps(options: FakeOptions = {}) {
  const calls = {
    countRecent: [] as { identity: { reporterId: string | null; anonymousReporterId: string | null }; windowMinutes: number }[],
    getPublicMessage: [] as string[],
    create: [] as NewReportInput[],
  };
  const deps: ReportMessageDeps = {
    reports: {
      async countRecentByIdentity(identity, windowMinutes) {
        calls.countRecent.push({ identity, windowMinutes });
        return options.recentCount ?? 0;
      },
      async create(input) {
        calls.create.push(input);
        if (options.duplicate) return null;
        const report: MessageReport = {
          id: "report-1",
          ...input,
          status: "open",
          createdAt: "2026-10-08T12:00:00.000Z",
          reviewedAt: null,
          reviewedBy: null,
        };
        return report;
      },
    },
    async getPublicMessage(id) {
      calls.getPublicMessage.push(id);
      return options.messageExists === false ? null : { id };
    },
  };
  return { deps, calls };
}

/** An in-memory KV that keeps TTLs, so the tests can see what would expire. */
function fakeKv() {
  const store = new Map<string, { value: string; ttl?: number }>();
  const kv: ReportLimitKv = {
    async get(key) {
      return store.get(key)?.value ?? null;
    },
    async put(key, value, options) {
      store.set(key, { value, ttl: options?.expirationTtl });
    },
  };
  return { kv, store };
}

function fakeGate(options: { turnstileOk?: boolean; limiter?: boolean; limiterRequired?: boolean } = {}) {
  const verified: string[] = [];
  const { kv, store } = fakeKv();
  let n = 0;
  const gate: AnonymousReportGate = {
    async verifyTurnstile(token) {
      verified.push(token);
      return options.turnstileOk ?? true;
    },
    limiter: options.limiter === false ? null : { kv, addressHash: "hash-a" },
    limiterRequired: options.limiterRequired ?? true,
    now: new Date("2026-11-14T12:30:00Z"),
    newReporterId: () => "anon-random-" + String(++n),
  };
  return { gate, verified, store };
}

function params(overrides: Partial<ReportMessageParams> = {}): ReportMessageParams {
  return {
    messageId: "msg-1",
    reason: "spam",
    reporterId: "user-1",
    ...overrides,
  };
}

describe("reportMessageAsReporter", () => {
  it("refuses a signed-out report when no anonymous gate is available, before any read", async () => {
    const { deps, calls } = fakeDeps();
    const result = await reportMessageAsReporter(params({ reporterId: null, turnstileToken: "t" }), deps);
    assert.deepEqual(result, { ok: false, error: "unavailable" });
    assert.equal(calls.countRecent.length + calls.getPublicMessage.length + calls.create.length, 0);
  });

  it("files a signed-in report under the session account, with no anonymous id and no challenge", async () => {
    const { deps, calls } = fakeDeps();
    const gate = fakeGate();
    deps.anonymous = gate.gate;
    const result = await reportMessageAsReporter(params({ reporterId: "user-1", turnstileToken: "ignored" }), deps);
    assert.deepEqual(result, { ok: true });
    assert.deepEqual(calls.countRecent[0].identity, { reporterId: "user-1", anonymousReporterId: null });
    assert.equal(calls.create[0].reporterId, "user-1");
    assert.equal(calls.create[0].anonymousReporterId, null);
    assert.equal(gate.verified.length, 0);
  });

  it("allows 9 recent reports and checks a 10-minute window", async () => {
    const { deps, calls } = fakeDeps({ recentCount: 9 });
    const result = await reportMessageAsReporter(params(), deps);
    assert.deepEqual(result, { ok: true });
    assert.equal(calls.countRecent[0].windowMinutes, 10);
  });

  it("rate-limits at 10 recent reports without creating one", async () => {
    const { deps, calls } = fakeDeps({ recentCount: 10 });
    const result = await reportMessageAsReporter(params(), deps);
    assert.deepEqual(result, { ok: false, error: "rate-limited" });
    assert.equal(calls.getPublicMessage.length, 0);
    assert.equal(calls.create.length, 0);
  });

  it("rejects an unknown reason first — before the rate limit, a challenge or the message", async () => {
    const { deps, calls } = fakeDeps({ recentCount: 10 });
    const gate = fakeGate();
    deps.anonymous = gate.gate;
    assert.deepEqual(await reportMessageAsReporter(params({ reason: "nonsense" as ReportReason }), deps), {
      ok: false,
      error: "invalid-reason",
    });
    assert.deepEqual(
      await reportMessageAsReporter(params({ reporterId: null, turnstileToken: "t", reason: "nonsense" as ReportReason }), deps),
      { ok: false, error: "invalid-reason" }
    );
    assert.equal(calls.countRecent.length + calls.getPublicMessage.length + calls.create.length, 0);
    assert.equal(gate.verified.length, 0);
  });

  it("returns not-found for a message that isn't public", async () => {
    const { deps, calls } = fakeDeps({ messageExists: false });
    const result = await reportMessageAsReporter(params({ messageId: "msg-pending" }), deps);
    assert.deepEqual(result, { ok: false, error: "not-found" });
    assert.deepEqual(calls.getPublicMessage, ["msg-pending"]);
    assert.equal(calls.create.length, 0);
  });

  it("trims details", async () => {
    const { deps, calls } = fakeDeps();
    await reportMessageAsReporter(params({ details: "  looks like spam \n" }), deps);
    assert.equal(calls.create[0].details, "looks like spam");
  });

  it("cuts details to 500 characters after trimming", async () => {
    const { deps, calls } = fakeDeps();
    await reportMessageAsReporter(params({ details: `  ${"a".repeat(600)}` }), deps);
    assert.equal(calls.create[0].details, "a".repeat(500));
  });

  it("stores missing or whitespace-only details as null", async () => {
    for (const details of [undefined, "", "   \n\t "]) {
      const { deps, calls } = fakeDeps();
      await reportMessageAsReporter(params({ details }), deps);
      assert.equal(calls.create[0].details, null);
    }
  });

  it("returns already-reported when create finds a duplicate", async () => {
    const { deps, calls } = fakeDeps({ duplicate: true });
    const result = await reportMessageAsReporter(params(), deps);
    assert.deepEqual(result, { ok: false, error: "already-reported" });
    assert.equal(calls.create.length, 1);
  });

  it("files a report with exactly the validated fields", async () => {
    const { deps, calls } = fakeDeps();
    const result = await reportMessageAsReporter(
      params({ messageId: "msg-7", reason: "harassment", details: "why", reporterId: "user-9" }),
      deps
    );
    assert.deepEqual(result, { ok: true });
    assert.deepEqual(calls.create, [
      { messageId: "msg-7", reporterId: "user-9", anonymousReporterId: null, reason: "harassment", details: "why" },
    ]);
  });
});

describe("reportMessageAsReporter — signed out (security pack 2b)", () => {
  const anon = (overrides: Partial<ReportMessageParams> = {}) => params({ reporterId: null, turnstileToken: "token-1", ...overrides });

  it("needs a solved Turnstile challenge", async () => {
    for (const turnstileToken of [undefined, ""]) {
      const { deps, calls } = fakeDeps();
      const gate = fakeGate();
      deps.anonymous = gate.gate;
      assert.deepEqual(await reportMessageAsReporter(anon({ turnstileToken }), deps), { ok: false, error: "verification-failed" });
      assert.equal(gate.verified.length, 0);
      assert.equal(calls.create.length, 0);
    }
    const { deps, calls } = fakeDeps();
    const gate = fakeGate({ turnstileOk: false });
    deps.anonymous = gate.gate;
    assert.deepEqual(await reportMessageAsReporter(anon(), deps), { ok: false, error: "verification-failed" });
    assert.deepEqual(gate.verified, ["token-1"]);
    assert.equal(calls.getPublicMessage.length + calls.create.length, 0);
  });

  it("files it under a fresh random id each time — never a client id, never the account rate-limit query", async () => {
    const { deps, calls } = fakeDeps();
    const gate = fakeGate();
    deps.anonymous = gate.gate;
    assert.deepEqual(await reportMessageAsReporter(anon({ messageId: "m1" }), deps), { ok: true });
    assert.deepEqual(await reportMessageAsReporter(anon({ messageId: "m2" }), deps), { ok: true });
    assert.deepEqual(
      calls.create.map((c) => [c.reporterId, c.anonymousReporterId]),
      [
        [null, "anon-random-1"],
        [null, "anon-random-2"],
      ]
    );
    assert.equal(calls.countRecent.length, 0);
  });

  it("allows one report per address per card, remembered for 24 hours", async () => {
    const { deps, calls } = fakeDeps();
    const gate = fakeGate();
    deps.anonymous = gate.gate;
    assert.deepEqual(await reportMessageAsReporter(anon(), deps), { ok: true });
    assert.deepEqual(await reportMessageAsReporter(anon(), deps), { ok: false, error: "already-reported" });
    assert.equal(calls.create.length, 1);
    const cardEntry = [...gate.store.entries()].find(([key]) => key.includes(":m:"));
    assert.equal(cardEntry?.[1].ttl, 86400);
  });

  it(`allows ${ANONYMOUS_REPORTS_PER_HOUR} reports per address per hour, then refuses before reading the message`, async () => {
    const { deps, calls } = fakeDeps();
    const gate = fakeGate();
    deps.anonymous = gate.gate;
    for (let i = 0; i < ANONYMOUS_REPORTS_PER_HOUR; i++) {
      assert.deepEqual(await reportMessageAsReporter(anon({ messageId: `m${i}` }), deps), { ok: true });
    }
    const reads = calls.getPublicMessage.length;
    assert.deepEqual(await reportMessageAsReporter(anon({ messageId: "another" }), deps), { ok: false, error: "rate-limited" });
    assert.equal(calls.getPublicMessage.length, reads);
    const hourEntry = [...gate.store.entries()].find(([key]) => key.includes(":h:"));
    assert.equal(hourEntry?.[1].value, String(ANONYMOUS_REPORTS_PER_HOUR));
    assert.ok((hourEntry?.[1].ttl ?? 0) <= 3600 + 120);
  });

  it("doesn't count reports that weren't filed (unknown card)", async () => {
    const { deps } = fakeDeps({ messageExists: false });
    const gate = fakeGate();
    deps.anonymous = gate.gate;
    assert.deepEqual(await reportMessageAsReporter(anon(), deps), { ok: false, error: "not-found" });
    assert.equal(gate.store.size, 0);
  });

  it("refuses when the limits are required but can't be applied; allows it in development without them", async () => {
    const required = fakeDeps();
    required.deps.anonymous = fakeGate({ limiter: false, limiterRequired: true }).gate;
    assert.deepEqual(await reportMessageAsReporter(anon(), required.deps), { ok: false, error: "unavailable" });
    assert.equal(required.calls.create.length, 0);

    const dev = fakeDeps();
    dev.deps.anonymous = fakeGate({ limiter: false, limiterRequired: false }).gate;
    assert.deepEqual(await reportMessageAsReporter(anon(), dev.deps), { ok: true });
  });

  it("refuses when the limit store fails, and keeps a filed report when only counting it fails", async () => {
    const broken = fakeDeps();
    const gate = fakeGate();
    gate.gate.limiter = {
      addressHash: "hash-a",
      kv: {
        async get() {
          throw new Error("kv down");
        },
        async put() {},
      },
    };
    broken.deps.anonymous = gate.gate;
    assert.deepEqual(await reportMessageAsReporter(anon(), broken.deps), { ok: false, error: "unavailable" });

    const writeFails = fakeDeps();
    const gate2 = fakeGate();
    gate2.gate.limiter = {
      addressHash: "hash-a",
      kv: {
        async get() {
          return null;
        },
        async put() {
          throw new Error("kv write failed");
        },
      },
    };
    writeFails.deps.anonymous = gate2.gate;
    assert.deepEqual(await reportMessageAsReporter(anon(), writeFails.deps), { ok: true });
    assert.equal(writeFails.calls.create.length, 1);
  });
});
