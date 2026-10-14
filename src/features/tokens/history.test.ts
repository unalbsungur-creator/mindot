import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { User } from "@/features/users/types";
import { TOKEN_HISTORY_PAGE_SIZE, loadTokenHistory, type TokenHistoryDeps } from "./history";
import { formatLedgerCursor, parseLedgerCursor, type LedgerCursor } from "./lib/ledgerCursor";
import type { TokenLedgerEntry } from "./types";

const ADMIN = { id: "admin-1" };
const TOMBSTONE = "deleted_5f0c2a8e-0000-4000-8000-000000000000";

function entry(overrides: Partial<TokenLedgerEntry>): TokenLedgerEntry {
  return {
    id: "entry-1",
    userId: "user-1",
    amount: 5,
    type: "grant",
    balanceAfter: 5,
    referenceType: "admin_grant",
    referenceId: "user-1",
    idempotencyKey: "admin_grant:admin-1:req",
    externalProvider: null,
    externalReference: null,
    createdBy: ADMIN.id,
    note: "welcome",
    createdAt: "2026-10-11T10:00:00.000Z",
    ...overrides,
  };
}

function user(id: string, name: string | null, email: string): User {
  return { id, name, email } as User;
}

function deps(options: { admin?: { id: string } | null; entries?: TokenLedgerEntry[]; nextCursor?: LedgerCursor | null } = {}) {
  const calls = { listLedger: [] as { limit: number; before: LedgerCursor | null }[], getActiveUsersByIds: [] as string[][] };
  const active = [user("user-1", "Ayşe", "ayse@example.test"), user(ADMIN.id, null, "admin@example.test")];
  const value: TokenHistoryDeps = {
    requireAdmin: async () => (options.admin === undefined ? ADMIN : options.admin),
    async listLedger(input) {
      calls.listLedger.push(input);
      return { entries: options.entries ?? [entry({})], nextCursor: options.nextCursor ?? null };
    },
    async getActiveUsersByIds(ids) {
      calls.getActiveUsersByIds.push(ids);
      return active.filter((candidate) => ids.includes(candidate.id));
    },
  };
  return { deps: value, calls };
}

describe("loadTokenHistory", () => {
  it("refuses a signed-out or non-admin request without querying the ledger", async () => {
    // requireAdmin returns null for both a missing session and a non-admin role.
    const { deps: d, calls } = deps({ admin: null });
    assert.deepEqual(await loadTokenHistory({ cursor: null }, d), { status: "unauthorized" });
    assert.equal(calls.listLedger.length, 0);
    assert.equal(calls.getActiveUsersByIds.length, 0);
  });

  it("returns one bounded page of rows for an admin", async () => {
    const { deps: d, calls } = deps();
    const result = await loadTokenHistory({ cursor: null }, d);

    assert.deepEqual(calls.listLedger, [{ limit: TOKEN_HISTORY_PAGE_SIZE, before: null }]);
    assert.deepEqual(result, {
      status: "ok",
      rows: [
        {
          id: "entry-1",
          createdAt: "2026-10-11T10:00:00.000Z",
          type: "grant",
          amount: 5,
          balanceAfter: 5,
          user: { kind: "active", name: "Ayşe", email: "ayse@example.test" },
          createdBy: { kind: "active", name: null, email: "admin@example.test" },
          note: "welcome",
          externalProvider: null,
          externalReference: null,
        },
      ],
      nextCursor: null,
    });
  });

  it("looks each account up once, in one batch", async () => {
    const { deps: d, calls } = deps({
      entries: [entry({ id: "a" }), entry({ id: "b", type: "consume", amount: -1, balanceAfter: 4, createdBy: null })],
    });
    await loadTokenHistory({ cursor: null }, d);
    assert.equal(calls.getActiveUsersByIds.length, 1);
    assert.deepEqual([...calls.getActiveUsersByIds[0]].sort(), [ADMIN.id, "user-1"]);
  });

  it("shows a deleted account without its tombstone id or placeholder email", async () => {
    const { deps: d } = deps({
      entries: [entry({ userId: TOMBSTONE, referenceId: TOMBSTONE }), entry({ id: "e2", createdBy: TOMBSTONE })],
    });
    const result = await loadTokenHistory({ cursor: null }, d);

    assert.equal(result.status, "ok");
    if (result.status !== "ok") return;
    assert.deepEqual(result.rows[0].user, { kind: "deleted" });
    assert.deepEqual(result.rows[1].createdBy, { kind: "deleted" });
    const payload = JSON.stringify(result);
    assert.ok(!payload.includes(TOMBSTONE), "tombstone id leaked");
    assert.ok(!payload.includes("deleted.invalid"), "tombstone email leaked");
    assert.ok(!payload.includes("idempotency"), "internal keys leaked");
  });

  it("leaves createdBy null for entries no admin created", async () => {
    const { deps: d } = deps({ entries: [entry({ type: "consume", amount: -1, createdBy: null })] });
    const result = await loadTokenHistory({ cursor: null }, d);
    assert.equal(result.status === "ok" && result.rows[0].createdBy, null);
  });

  it("passes a valid cursor through and returns the next one", async () => {
    const before = { createdAtMicros: "1791712800123456", id: "entry-9" };
    const { deps: d, calls } = deps({ nextCursor: { createdAtMicros: "1791712800000001", id: "entry-1" } });
    const result = await loadTokenHistory({ cursor: formatLedgerCursor(before) }, d);

    assert.deepEqual(calls.listLedger[0].before, before);
    assert.equal(result.status === "ok" && result.nextCursor, "1791712800000001_entry-1");
  });

  it("falls back to the first page for a malformed cursor", async () => {
    for (const cursor of ["", "abc", "123", "_x", "12_", "1.5_x", "1_a b", `1_${"x".repeat(65)}`, "1_x'; drop table token_ledger;--"]) {
      const { deps: d, calls } = deps();
      await loadTokenHistory({ cursor }, d);
      assert.equal(calls.listLedger[0].before, null, cursor);
    }
  });
});

describe("ledger cursor", () => {
  it("round-trips", () => {
    const cursor = { createdAtMicros: "1791712800123456", id: "0b6c1c9e-2f6a-4c55-9d6e-7f1f4b9a0c11" };
    assert.deepEqual(parseLedgerCursor(formatLedgerCursor(cursor)), cursor);
  });

  it("rejects missing input", () => {
    assert.equal(parseLedgerCursor(undefined), null);
    assert.equal(parseLedgerCursor(null), null);
  });
});
