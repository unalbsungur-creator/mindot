import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { User, UserRole } from "@/features/users/types";
import {
  checkAppleSignIn,
  checkGoogleSignIn,
  completeAppleSignIn,
  completeGoogleSignIn,
  finishAppleSignIn,
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
