import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reportMessageAsReporter, type ReportMessageDeps, type ReportMessageParams } from "./service";
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

function params(overrides: Partial<ReportMessageParams> = {}): ReportMessageParams {
  return {
    messageId: "msg-1",
    reason: "spam",
    reporterId: "user-1",
    ...overrides,
  };
}

describe("reportMessageAsReporter", () => {
  it("returns no-identity with neither a reporterId nor an anonymousId, before any read", async () => {
    const { deps, calls } = fakeDeps();
    const result = await reportMessageAsReporter(params({ reporterId: null }), deps);
    assert.deepEqual(result, { ok: false, error: "no-identity" });
    assert.equal(calls.countRecent.length, 0);
    assert.equal(calls.getPublicMessage.length, 0);
    assert.equal(calls.create.length, 0);
  });

  it("treats an empty anonymousId as no identity", async () => {
    const { deps } = fakeDeps();
    const result = await reportMessageAsReporter(params({ reporterId: null, anonymousId: "" }), deps);
    assert.deepEqual(result, { ok: false, error: "no-identity" });
  });

  it("lets a signed-in reporterId override any anonymousId", async () => {
    const { deps, calls } = fakeDeps();
    const result = await reportMessageAsReporter(params({ reporterId: "user-1", anonymousId: "anon-1" }), deps);
    assert.deepEqual(result, { ok: true });
    assert.deepEqual(calls.countRecent[0].identity, { reporterId: "user-1", anonymousReporterId: null });
    assert.equal(calls.create[0].reporterId, "user-1");
    assert.equal(calls.create[0].anonymousReporterId, null);
  });

  it("files an anonymous report under the anonymousId", async () => {
    const { deps, calls } = fakeDeps();
    const result = await reportMessageAsReporter(params({ reporterId: null, anonymousId: "anon-1" }), deps);
    assert.deepEqual(result, { ok: true });
    assert.deepEqual(calls.countRecent[0].identity, { reporterId: null, anonymousReporterId: "anon-1" });
    assert.equal(calls.create[0].reporterId, null);
    assert.equal(calls.create[0].anonymousReporterId, "anon-1");
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

  it("checks the rate limit before the reason", async () => {
    const { deps } = fakeDeps({ recentCount: 10 });
    const result = await reportMessageAsReporter(params({ reason: "nonsense" as ReportReason }), deps);
    assert.deepEqual(result, { ok: false, error: "rate-limited" });
  });

  it("rejects an unknown reason before looking up the message", async () => {
    const { deps, calls } = fakeDeps();
    const result = await reportMessageAsReporter(params({ reason: "nonsense" as ReportReason }), deps);
    assert.deepEqual(result, { ok: false, error: "invalid-reason" });
    assert.equal(calls.getPublicMessage.length, 0);
    assert.equal(calls.create.length, 0);
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
