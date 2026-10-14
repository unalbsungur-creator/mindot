import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import type { GrantFirstShareRewardResult } from "./repository";
import { claimFirstShareRewardForSession, type FirstShareRewardDeps } from "./rewards";
import type { TokenLedgerEntry } from "./types";

// Database-free: the transaction itself (once per account, concurrency,
// ineligible accounts, account deletion) runs in repository.db.test.ts.

function entry(overrides: Partial<TokenLedgerEntry> = {}): TokenLedgerEntry {
  return {
    id: "entry-1",
    userId: "session-user",
    amount: 2,
    type: "grant",
    balanceAfter: 5,
    referenceType: "first_share_reward",
    referenceId: null,
    idempotencyKey: "first_share_reward:00000000-0000-4000-8000-000000000000",
    externalProvider: null,
    externalReference: null,
    createdBy: null,
    note: null,
    createdAt: new Date(0).toISOString(),
    ...overrides,
  };
}

function deps(sessionUserId: string | null, result: GrantFirstShareRewardResult | Error) {
  const granted: string[] = [];
  const value: FirstShareRewardDeps = {
    getSessionUserId: async () => sessionUserId,
    async grant(userId) {
      granted.push(userId);
      if (result instanceof Error) throw result;
      return result;
    },
  };
  return { deps: value, granted };
}

describe("claimFirstShareRewardForSession", () => {
  let errorLog: ReturnType<typeof mock.method>;
  beforeEach(() => {
    errorLog = mock.method(console, "error", () => {});
  });
  afterEach(() => {
    errorLog.mock.restore();
  });

  it("requires a session and never reaches the repository without one", async () => {
    const { deps: d, granted } = deps(null, { status: "granted", entry: entry(), balance: 2 });
    assert.deepEqual(await claimFirstShareRewardForSession(d), { status: "auth-required" });
    assert.deepEqual(granted, []);
  });

  it("credits only the session's own account", async () => {
    const { deps: d, granted } = deps("session-user", { status: "granted", entry: entry(), balance: 5 });
    assert.deepEqual(await claimFirstShareRewardForSession(d), { status: "granted", amount: 2, balance: 5 });
    assert.deepEqual(granted, ["session-user"]);
  });

  it("maps a repeated claim and an ineligible account without a granted status", async () => {
    assert.deepEqual(
      await claimFirstShareRewardForSession(deps("session-user", { status: "already_rewarded" }).deps),
      { status: "already-rewarded" }
    );
    assert.deepEqual(await claimFirstShareRewardForSession(deps("session-user", { status: "ineligible" }).deps), {
      status: "ineligible",
    });
  });

  it("reports a repository error as failed, logged, never thrown to the share page", async () => {
    const { deps: d } = deps("session-user", new Error("connection lost"));
    assert.deepEqual(await claimFirstShareRewardForSession(d), { status: "failed" });
    assert.equal(errorLog.mock.callCount(), 1);
  });
});
