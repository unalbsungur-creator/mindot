import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import type { AppleRevokeOutcome } from "@/features/auth/lib/appleRevoke";
import {
  deleteOwnAccountForUser,
  deleteOwnAccountWithSession,
  deleteUserAccount,
  type AccountDeletionOutcome,
  type DeleteOwnAccountDeps,
  type DeleteOwnAccountServiceResult,
  type DeleteOwnAccountSessionDeps,
} from "./accountDeletion";
import type { DeleteAccountResult } from "./repository";
import type { User, UserRole } from "./types";

const USER_ID = "google-sub-1";
const APPLE_ID = "apple:sub-1";
const EMAIL = "Person@Example.com";

function ownAccountDeps(options: { user?: { role: UserRole; email: string } | null; outcome?: AccountDeletionOutcome | Error } = {}) {
  const deleted: string[] = [];
  const user = options.user === undefined ? { role: "user" as UserRole, email: EMAIL } : options.user;
  const deps: DeleteOwnAccountDeps = {
    users: {
      async getById(id) {
        return user ? ({ id, ...user } as User) : null;
      },
    },
    async deleteAccount(id) {
      deleted.push(id);
      if (options.outcome instanceof Error) throw options.outcome;
      return options.outcome ?? { status: "deleted" };
    },
  };
  return { deps, deleted };
}

describe("deleteOwnAccountForUser", () => {
  let errorLog: ReturnType<typeof mock.method>;
  beforeEach(() => {
    errorLog = mock.method(console, "error", () => {});
  });
  afterEach(() => {
    mock.restoreAll();
  });

  it("returns account-not-found for a missing account, before the confirmation check", async () => {
    const { deps, deleted } = ownAccountDeps({ user: null });
    const result = await deleteOwnAccountForUser({ userId: USER_ID, confirmationEmail: "wrong@example.com" }, deps);
    assert.deepEqual(result, { ok: false, error: "account-not-found" });
    assert.deepEqual(deleted, []);
  });

  it("doesn't check the database role itself — a wrong email on an admin row is still confirmation-mismatch", async () => {
    const { deps, deleted } = ownAccountDeps({ user: { role: "admin", email: EMAIL } });
    const result = await deleteOwnAccountForUser({ userId: USER_ID, confirmationEmail: "wrong@example.com" }, deps);
    assert.deepEqual(result, { ok: false, error: "confirmation-mismatch" });
    assert.deepEqual(deleted, []);
  });

  it("leaves the admin refusal to the deletion transaction", async () => {
    const { deps, deleted } = ownAccountDeps({ user: { role: "admin", email: EMAIL }, outcome: { status: "admin-account" } });
    const result = await deleteOwnAccountForUser({ userId: USER_ID, confirmationEmail: EMAIL }, deps);
    assert.deepEqual(result, { ok: false, error: "admin-account" });
    assert.deepEqual(deleted, [USER_ID]);
  });

  it("rejects a non-string confirmation", async () => {
    const { deps, deleted } = ownAccountDeps();
    for (const confirmationEmail of [undefined, null, 42, { email: EMAIL }]) {
      const result = await deleteOwnAccountForUser({ userId: USER_ID, confirmationEmail: confirmationEmail as unknown as string }, deps);
      assert.deepEqual(result, { ok: false, error: "confirmation-mismatch" });
    }
    assert.deepEqual(deleted, []);
  });

  it("rejects a different email", async () => {
    const { deps, deleted } = ownAccountDeps();
    const result = await deleteOwnAccountForUser({ userId: USER_ID, confirmationEmail: "other@example.com" }, deps);
    assert.deepEqual(result, { ok: false, error: "confirmation-mismatch" });
    assert.deepEqual(deleted, []);
  });

  it("matches the email trimmed and case-insensitively, on both sides", async () => {
    const { deps, deleted } = ownAccountDeps({ user: { role: "user", email: "  Person@Example.com " } });
    const result = await deleteOwnAccountForUser({ userId: USER_ID, confirmationEmail: "  person@EXAMPLE.com\n" }, deps);
    assert.deepEqual(result, { ok: true });
    assert.deepEqual(deleted, [USER_ID]);
  });

  const mappings: [AccountDeletionOutcome, Awaited<ReturnType<typeof deleteOwnAccountForUser>>][] = [
    [{ status: "deleted" }, { ok: true }],
    [{ status: "not-found" }, { ok: false, error: "account-not-found" }],
    [{ status: "admin-account" }, { ok: false, error: "admin-account" }],
    [{ status: "apple-revoke-failed" }, { ok: false, error: "apple-revoke-failed" }],
  ];
  for (const [outcome, expected] of mappings) {
    it(`maps a ${outcome.status} deletion outcome`, async () => {
      const { deps } = ownAccountDeps({ outcome });
      const result = await deleteOwnAccountForUser({ userId: USER_ID, confirmationEmail: EMAIL }, deps);
      assert.deepEqual(result, expected);
    });
  }

  it("returns failed when the deletion throws, logging only the error's name", async () => {
    const error = new TypeError("duplicate key person@example.com");
    const { deps } = ownAccountDeps({ outcome: error });
    const result = await deleteOwnAccountForUser({ userId: USER_ID, confirmationEmail: EMAIL }, deps);
    assert.deepEqual(result, { ok: false, error: "failed" });
    assert.equal(errorLog.mock.callCount(), 1);
    const args = errorLog.mock.calls[0].arguments;
    assert.deepEqual(args, ["[account-deletion] transaction failed", "TypeError"]);
    assert.ok(!JSON.stringify(args).includes("person@example.com"));
  });
});

describe("deleteOwnAccountWithSession (the deleteOwnAccount server action's flow)", () => {
  let errorLog: ReturnType<typeof mock.method>;
  beforeEach(() => {
    errorLog = mock.method(console, "error", () => {});
  });
  afterEach(() => {
    mock.restoreAll();
  });

  type Session = Awaited<ReturnType<DeleteOwnAccountSessionDeps["auth"]>>;

  function sessionDeps(options: { session?: Session; result?: DeleteOwnAccountServiceResult; signOutError?: Error } = {}) {
    const deletions: { userId: string; confirmationEmail: string }[] = [];
    const signOuts: unknown[] = [];
    const deps: DeleteOwnAccountSessionDeps = {
      async auth() {
        return options.session === undefined ? { user: { id: USER_ID, role: "user" } } : options.session;
      },
      async signOut(signOutOptions) {
        signOuts.push(signOutOptions);
        if (options.signOutError) throw options.signOutError;
      },
      async deleteOwnAccount(params) {
        deletions.push(params);
        return options.result ?? { ok: true };
      },
    };
    return { deps, deletions, signOuts };
  }

  for (const session of [null, {}, { user: null }, { user: { id: "" } }, { user: { id: null, role: "user" } }] as Session[]) {
    it(`returns auth-required without deleting or signing out for session ${JSON.stringify(session)}`, async () => {
      const { deps, deletions, signOuts } = sessionDeps({ session });
      assert.deepEqual(await deleteOwnAccountWithSession(EMAIL, deps), { ok: false, error: "auth-required" });
      assert.deepEqual(deletions, []);
      assert.deepEqual(signOuts, []);
    });
  }

  it("refuses an admin session without deleting or signing out", async () => {
    const { deps, deletions, signOuts } = sessionDeps({ session: { user: { id: USER_ID, role: "admin" } } });
    assert.deepEqual(await deleteOwnAccountWithSession(EMAIL, deps), { ok: false, error: "admin-account" });
    assert.deepEqual(deletions, []);
    assert.deepEqual(signOuts, []);
  });

  it("deletes the session's own account with the typed confirmation, then signs out once", async () => {
    const { deps, deletions, signOuts } = sessionDeps({ session: { user: { id: "session-user", role: "user" } } });
    assert.deepEqual(await deleteOwnAccountWithSession(" typed@example.com ", deps), { ok: true });
    assert.deepEqual(deletions, [{ userId: "session-user", confirmationEmail: " typed@example.com " }]);
    assert.deepEqual(signOuts, [{ redirect: false }]);
    assert.equal(errorLog.mock.callCount(), 0);
  });

  const failures: [DeleteOwnAccountServiceResult, Awaited<ReturnType<typeof deleteOwnAccountWithSession>>][] = [
    [{ ok: false, error: "confirmation-mismatch" }, { ok: false, error: "confirmation-mismatch" }],
    [{ ok: false, error: "account-not-found" }, { ok: false, error: "auth-required" }],
    [{ ok: false, error: "admin-account" }, { ok: false, error: "admin-account" }],
    [{ ok: false, error: "apple-revoke-failed" }, { ok: false, error: "apple-revoke-failed" }],
    [{ ok: false, error: "failed" }, { ok: false, error: "failed" }],
  ];
  for (const [result, expected] of failures) {
    it(`maps ${result.ok ? "ok" : result.error} to ${JSON.stringify(expected)} and doesn't sign out`, async () => {
      const { deps, deletions, signOuts } = sessionDeps({ result });
      assert.deepEqual(await deleteOwnAccountWithSession(EMAIL, deps), expected);
      assert.equal(deletions.length, 1);
      assert.deepEqual(signOuts, []);
    });
  }

  it("doesn't sign out when the deletion throws", async () => {
    const { deps, signOuts } = sessionDeps();
    deps.deleteOwnAccount = async () => {
      throw new Error("unexpected");
    };
    await assert.rejects(deleteOwnAccountWithSession(EMAIL, deps), /unexpected/);
    assert.deepEqual(signOuts, []);
  });

  it("still reports the committed deletion as ok when sign-out fails, logging only the error's name", async () => {
    const signOutError = new TypeError(`Invalid URL for ${EMAIL} token=secret-session-token`);
    const { deps, deletions, signOuts } = sessionDeps({ signOutError });
    assert.deepEqual(await deleteOwnAccountWithSession(EMAIL, deps), { ok: true });
    assert.equal(deletions.length, 1);
    assert.deepEqual(signOuts, [{ redirect: false }]);
    assert.equal(errorLog.mock.callCount(), 1);
    const args = errorLog.mock.calls[0].arguments;
    assert.deepEqual(args, ["[account-deletion] sign-out after deletion failed", "TypeError"]);
    const logged = JSON.stringify(args);
    for (const secret of [EMAIL, USER_ID, "secret-session-token", "Invalid URL"]) assert.ok(!logged.includes(secret), secret);
  });

  it("logs a non-Error sign-out failure as unknown", async () => {
    const { deps } = sessionDeps();
    deps.signOut = async () => {
      throw "a string";
    };
    assert.deepEqual(await deleteOwnAccountWithSession(EMAIL, deps), { ok: true });
    assert.deepEqual(errorLog.mock.calls[0].arguments, ["[account-deletion] sign-out after deletion failed", "unknown"]);
  });
});

describe("deleteUserAccount", () => {
  let warnLog: ReturnType<typeof mock.method>;
  beforeEach(() => {
    warnLog = mock.method(console, "warn", () => {});
  });
  afterEach(() => {
    mock.restoreAll();
  });

  function accountDeps(revoke: AppleRevokeOutcome | Error) {
    const calls: string[] = [];
    return {
      calls,
      deps: {
        async revokeApple(userId: string) {
          calls.push(`revoke:${userId}`);
          if (revoke instanceof Error) throw revoke;
          return revoke;
        },
        async deleteAccount(userId: string): Promise<DeleteAccountResult> {
          calls.push(`delete:${userId}`);
          return { status: "deleted" };
        },
      },
    };
  }

  it("skips Apple for a Google account and deletes", async () => {
    const { deps, calls } = accountDeps("revoked");
    const result = await deleteUserAccount(USER_ID, deps);
    assert.deepEqual(result, { status: "deleted" });
    assert.deepEqual(calls, [`delete:${USER_ID}`]);
  });

  it("deletes nothing when the Apple revoke fails", async () => {
    const { deps, calls } = accountDeps("failed");
    const result = await deleteUserAccount(APPLE_ID, deps);
    assert.deepEqual(result, { status: "apple-revoke-failed" });
    assert.deepEqual(calls, [`revoke:${APPLE_ID}`]);
  });

  for (const outcome of ["revoked", "nothing-to-revoke"] as const) {
    it(`revokes first, then deletes, without a warning, when Apple answers ${outcome}`, async () => {
      const { deps, calls } = accountDeps(outcome);
      const result = await deleteUserAccount(APPLE_ID, deps);
      assert.deepEqual(result, { status: "deleted" });
      assert.deepEqual(calls, [`revoke:${APPLE_ID}`, `delete:${APPLE_ID}`]);
      assert.equal(warnLog.mock.callCount(), 0);
    });
  }

  for (const outcome of ["not-configured", "unreadable"] as const) {
    it(`warns and still deletes when Apple answers ${outcome}`, async () => {
      const { deps, calls } = accountDeps(outcome);
      const result = await deleteUserAccount(APPLE_ID, deps);
      assert.deepEqual(result, { status: "deleted" });
      assert.deepEqual(calls, [`revoke:${APPLE_ID}`, `delete:${APPLE_ID}`]);
      assert.deepEqual(warnLog.mock.calls[0].arguments, ["[account-deletion] Apple authorization not revoked", outcome]);
    });
  }

  it("deletes nothing when the revoke throws, and lets the error through", async () => {
    const { deps, calls } = accountDeps(new Error("config"));
    await assert.rejects(deleteUserAccount(APPLE_ID, deps), /config/);
    assert.deepEqual(calls, [`revoke:${APPLE_ID}`]);
  });
});
