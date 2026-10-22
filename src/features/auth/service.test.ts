import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CredentialsUser, User, UserRole } from "@/features/users/types";
import {
  checkAppleSignIn,
  checkGoogleSignIn,
  completeAppleSignIn,
  completeGoogleSignIn,
  finishAppleSignIn,
  verifyAdminCredentials,
  type AdminCredentialsDeps,
  type ProviderSignInDeps,
} from "./service";

type Classification = "existing" | "new" | "email-in-use" | "email-missing";

function fakeUser(id: string, role: UserRole = "user"): User {
  return { id, role, email: `${id}@example.test`, name: "Name" } as User;
}

function fakeDeps(classification: Classification, rowRole: UserRole = "user") {
  const calls = {
    classify: [] as [string, string | null][],
    googleUpserts: [] as unknown[],
    appleUpserts: [] as unknown[],
    tokenSaves: [] as unknown[][],
  };
  const deps: ProviderSignInDeps = {
    users: {
      async classifyProviderSignIn(userId, email) {
        calls.classify.push([userId, email]);
        return classification;
      },
      async upsertFromGoogleProfile(profile) {
        calls.googleUpserts.push(profile);
        return fakeUser(profile.id, rowRole);
      },
      async upsertFromAppleProfile(profile) {
        calls.appleUpserts.push(profile);
        return fakeUser(`apple:${profile.sub}`, rowRole);
      },
    },
    appleTokens: {
      async save(...args) {
        calls.tokenSaves.push(args);
      },
    },
  };
  return { deps, calls };
}

const google = { sub: "1234567890", email: "person@example.test", name: "Person", picture: "https://img.example/p.png" };
const apple = { sub: "001.abc", email: "relay@privaterelay.appleid.com", name: "Person" };
const token = { refreshToken: "r-token", encryptionKey: "key" };

describe("Google sign-in", () => {
  it("allows a new identity with a free email and upserts it", async () => {
    const { deps, calls } = fakeDeps("new");
    const result = await completeGoogleSignIn(google, deps);
    assert.deepEqual(calls.classify, [["1234567890", "person@example.test"]]);
    assert.deepEqual(calls.googleUpserts, [
      { id: "1234567890", email: "person@example.test", name: "Person", image: "https://img.example/p.png" },
    ]);
    assert.equal(result.ok, true);
    assert.equal(result.ok && result.user.id, "1234567890");
  });

  it("refuses a new identity whose email belongs to another account — never merges", async () => {
    const { deps, calls } = fakeDeps("email-in-use");
    assert.deepEqual(await completeGoogleSignIn(google, deps), { ok: false, refusal: "account-exists" });
    assert.equal(calls.googleUpserts.length, 0);
  });

  it("refuses a new identity without an email, with no user-facing reason", async () => {
    const { deps, calls } = fakeDeps("email-missing");
    assert.deepEqual(await checkGoogleSignIn({ ...google, email: null }, deps), { ok: false, refusal: "denied" });
    assert.equal(calls.googleUpserts.length, 0);
  });

  it("refuses an empty subject without touching the database", async () => {
    const { deps, calls } = fakeDeps("new");
    assert.deepEqual(await checkGoogleSignIn({ ...google, sub: "" }, deps), { ok: false, refusal: "denied" });
    assert.equal(calls.classify.length, 0);
  });

  it("takes the role from the stored row, as before", async () => {
    const { deps } = fakeDeps("existing", "user");
    const result = await completeGoogleSignIn(google, deps);
    assert.equal(result.ok && result.role, "user");
  });
});

describe("Apple sign-in", () => {
  it("classifies under the namespaced apple:<sub> id", async () => {
    const { deps, calls } = fakeDeps("new");
    assert.deepEqual(await checkAppleSignIn(apple, deps), { ok: true });
    assert.deepEqual(calls.classify, [["apple:001.abc", "relay@privaterelay.appleid.com"]]);
  });

  it("refuses a taken email and a missing email with their own reasons", async () => {
    assert.deepEqual(await checkAppleSignIn(apple, fakeDeps("email-in-use").deps), { ok: false, refusal: "account-exists" });
    assert.deepEqual(await checkAppleSignIn({ ...apple, email: null }, fakeDeps("email-missing").deps), {
      ok: false,
      refusal: "apple-email-missing",
    });
  });

  it("never yields admin, whatever the stored row says", async () => {
    const { deps } = fakeDeps("existing", "admin");
    const result = await completeAppleSignIn(apple, "web", null, deps);
    assert.equal(result.ok && result.role, "user");
  });

  it("stores the refresh token under the given client only", async () => {
    const web = fakeDeps("existing");
    await finishAppleSignIn(apple, "web", token, web.deps);
    assert.deepEqual(web.calls.tokenSaves, [["apple:001.abc", "web", "r-token", "key"]]);

    const ios = fakeDeps("existing");
    await completeAppleSignIn(apple, "ios", token, ios.deps);
    assert.deepEqual(ios.calls.tokenSaves, [["apple:001.abc", "ios", "r-token", "key"]]);
  });

  it("stores nothing without a token, and nothing at all when refused", async () => {
    const none = fakeDeps("existing");
    await finishAppleSignIn(apple, "web", null, none.deps);
    assert.equal(none.calls.tokenSaves.length, 0);

    const refused = fakeDeps("email-in-use");
    await completeAppleSignIn(apple, "web", token, refused.deps);
    assert.equal(refused.calls.appleUpserts.length, 0);
    assert.equal(refused.calls.tokenSaves.length, 0);
  });
});

describe("admin credentials sign-in", () => {
  const NOW = new Date("2026-10-18T12:00:00.000Z");

  function admin(overrides: Partial<CredentialsUser> = {}): CredentialsUser {
    return {
      id: "admin-1",
      name: "Admin",
      role: "admin",
      status: "active",
      passwordHash: "scrypt:salt:hash",
      failedLoginAttempts: 0,
      lockedUntil: null,
      ...overrides,
    };
  }

  function fakeAdminDeps(candidate: CredentialsUser | null, correctPassword = "right", turnstilePasses = true) {
    const calls = {
      lookups: [] as string[],
      verified: 0,
      failures: [] as [string, Date | undefined][],
      successes: [] as string[],
      turnstile: [] as string[],
    };
    const deps: AdminCredentialsDeps = {
      users: {
        async getCredentialsByEmail(email) {
          calls.lookups.push(email);
          return candidate;
        },
        async recordFailedLogin(userId, now) {
          calls.failures.push([userId, now]);
        },
        async recordSuccessfulLogin(userId) {
          calls.successes.push(userId);
        },
      },
      async verifyPassword(password) {
        calls.verified++;
        return password === correctPassword;
      },
      async verifyTurnstile(token) {
        calls.turnstile.push(token);
        return turnstilePasses;
      },
    };
    return { deps, calls };
  }

  const PASS = { turnstileToken: "good-token" };

  it("signs in with the right password and resets the counter", async () => {
    const { deps, calls } = fakeAdminDeps(admin({ failedLoginAttempts: 3 }));
    const result = await verifyAdminCredentials({ email: "  Admin@Example.TEST ", password: "right" }, NOW, deps);
    assert.deepEqual(result, { id: "admin-1", name: "Admin", role: "admin" });
    assert.deepEqual(calls.lookups, ["admin@example.test"]);
    assert.deepEqual(calls.successes, ["admin-1"]);
    assert.equal(calls.failures.length, 0);
  });

  it("records a wrong password with the same `now` the lock check used", async () => {
    const { deps, calls } = fakeAdminDeps(admin());
    assert.equal(await verifyAdminCredentials({ email: "admin@example.test", password: "wrong" }, NOW, deps), null);
    assert.deepEqual(calls.failures, [["admin-1", NOW]]);
    assert.equal(calls.successes.length, 0);
  });

  it("refuses both a wrong and the right password while locked, without checking either or counting", async () => {
    const locked = admin({ failedLoginAttempts: 5, lockedUntil: new Date(NOW.getTime() + 60_000) });
    for (const password of ["wrong", "right"]) {
      const { deps, calls } = fakeAdminDeps(locked);
      assert.equal(await verifyAdminCredentials({ email: "admin@example.test", password }, NOW, deps), null);
      assert.equal(calls.verified, 0);
      assert.equal(calls.failures.length, 0);
      assert.equal(calls.successes.length, 0);
    }
  });

  it("checks the password again once the lock has expired — exactly at lockedUntil included", async () => {
    for (const lockedUntil of [NOW, new Date(NOW.getTime() - 1)]) {
      const wrong = fakeAdminDeps(admin({ failedLoginAttempts: 5, lockedUntil }));
      assert.equal(await verifyAdminCredentials({ email: "admin@example.test", password: "wrong" }, NOW, wrong.deps), null);
      assert.deepEqual(wrong.calls.failures, [["admin-1", NOW]]);

      const right = fakeAdminDeps(admin({ failedLoginAttempts: 5, lockedUntil }));
      assert.ok(await verifyAdminCredentials({ email: "admin@example.test", password: "right" }, NOW, right.deps));
      assert.deepEqual(right.calls.successes, ["admin-1"]);
    }
  });

  it("refuses unknown, non-admin and suspended accounts without counting anything", async () => {
    const cases: (CredentialsUser | null)[] = [null, admin({ role: "user" }), admin({ status: "suspended" })];
    for (const candidate of cases) {
      const { deps, calls } = fakeAdminDeps(candidate);
      assert.equal(await verifyAdminCredentials({ email: "admin@example.test", password: "right" }, NOW, deps), null);
      assert.equal(calls.verified, 0);
      assert.equal(calls.failures.length, 0);
      assert.equal(calls.successes.length, 0);
    }
  });

  it("refuses missing or non-string credentials before any lookup", async () => {
    const inputs = [undefined, {}, { email: "admin@example.test" }, { password: "right" }, { email: "   ", password: "right" }, { email: 1, password: 2 }];
    for (const input of inputs) {
      const { deps, calls } = fakeAdminDeps(admin());
      assert.equal(await verifyAdminCredentials({ ...input, ...PASS }, NOW, deps), null);
      assert.equal(calls.lookups.length, 0);
    }
  });

  // GÖREV 30 / P1 — Turnstile gate.
  it("fails closed when Turnstile rejects, with no DB query and no counter change", async () => {
    const { deps, calls } = fakeAdminDeps(admin(), "right", false); // turnstile rejects
    assert.equal(await verifyAdminCredentials({ email: "admin@example.test", password: "right", ...PASS }, NOW, deps), null);
    assert.equal(calls.turnstile.length, 1, "Turnstile checked exactly once");
    assert.equal(calls.lookups.length, 0, "no getCredentialsByEmail on a Turnstile reject");
    assert.equal(calls.verified, 0);
    assert.equal(calls.failures.length, 0, "the lockout counter is never touched by a bot");
    assert.equal(calls.successes.length, 0);
  });

  it("checks Turnstile exactly once, before the credential lookup, on a normal attempt", async () => {
    const { deps, calls } = fakeAdminDeps(admin());
    await verifyAdminCredentials({ email: "admin@example.test", password: "right", turnstileToken: "good-token" }, NOW, deps);
    assert.deepEqual(calls.turnstile, ["good-token"]);
    assert.deepEqual(calls.lookups, ["admin@example.test"]);
  });

  it("a valid token still enforces the password: wrong counts one failure, right signs in", async () => {
    const wrong = fakeAdminDeps(admin());
    assert.equal(await verifyAdminCredentials({ email: "admin@example.test", password: "nope", ...PASS }, NOW, wrong.deps), null);
    assert.deepEqual(wrong.calls.failures, [["admin-1", NOW]]);

    const right = fakeAdminDeps(admin());
    assert.deepEqual(await verifyAdminCredentials({ email: "admin@example.test", password: "right", ...PASS }, NOW, right.deps), {
      id: "admin-1",
      name: "Admin",
      role: "admin",
    });
    assert.deepEqual(right.calls.successes, ["admin-1"]);
  });
});

describe("OAuth isolation from the admin Turnstile gate", () => {
  // The Turnstile verifier lives only on AdminCredentialsDeps; Google/Apple
  // sign-in use ProviderSignInDeps, which has no such field and never reaches
  // verifyAdminCredentials — so OAuth is structurally unaffected by the gate.
  it("completes Google and Apple sign-in with no Turnstile dependency", async () => {
    const g = await completeGoogleSignIn(google, fakeDeps("new").deps);
    assert.equal(g.ok, true);
    const a = await completeAppleSignIn(apple, "web", null, fakeDeps("new").deps);
    assert.equal(a.ok, true);
  });
});
