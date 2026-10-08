import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { SignJWT } from "jose";
import type { UserAccountStatus, UserRole } from "@/features/users/types";
import { verifyMobileAccessToken } from "./lib/mobileAccessToken";
import { generateRefreshToken, hashRefreshSecret, parseRefreshToken } from "./lib/refreshToken";
import {
  authenticateMobileRequest,
  createMobileSession,
  refreshMobileSession,
  revokeMobileSession,
  type MobileSessionConfig,
  type MobileSessionDeps,
} from "./mobileService";
import type {
  ActiveMobileSession,
  MobileSessionRecord,
  MobileSessionRepository,
  MobileSessionTransaction,
  NewMobileSession,
} from "./mobileSessionRepository";

const NOW = new Date("2026-10-08T12:00:00.000Z");
const CONFIG: MobileSessionConfig = {
  accessToken: {
    secret: "test-secret-that-is-at-least-32-bytes-long!!",
    issuer: "https://staging.mind-ot.com",
    audience: "mindot-mobile-api",
    ttlSeconds: 15 * 60,
  },
  sessionTtlSeconds: 7 * 24 * 60 * 60,
};
const GOOGLE_USER = "google-sub-1";
const APPLE_USER = "apple:sub-1";
const SID = "11111111-1111-4111-8111-111111111111";
const OTHER_SID = "22222222-2222-4222-8222-222222222222";

interface FakeUser {
  role: UserRole;
  status: UserAccountStatus;
  deleted: boolean;
}

/**
 * In-memory repository with real transaction semantics: writes inside
 * `transaction()` go to a staged copy that is committed when the callback
 * returns and discarded when it throws.
 */
class FakeRepository implements MobileSessionRepository {
  rows = new Map<string, MobileSessionRecord>();
  users = new Map<string, FakeUser>();
  created: NewMobileSession[] = [];
  locked: string[] = [];
  transactions = 0;
  fail = false;

  async create(session: NewMobileSession): Promise<void> {
    if (this.fail) throw new Error("db down");
    this.created.push(session);
    this.rows.set(session.id, {
      id: session.id,
      userId: session.userId,
      refreshTokenHash: session.refreshTokenHash,
      previousRefreshTokenHash: null,
      platform: session.platform,
      expiresAt: session.expiresAt,
      revokedAt: null,
      createdAt: session.now,
      updatedAt: session.now,
    });
  }

  async transaction<T>(work: (tx: MobileSessionTransaction) => Promise<T>): Promise<T> {
    if (this.fail) throw new Error("db down");
    this.transactions++;
    const staged = new Map([...this.rows].map(([id, row]) => [id, { ...row }]));
    const tx: MobileSessionTransaction = {
      getByIdForUpdate: async (id) => {
        this.locked.push(id);
        const row = staged.get(id);
        return row ? { ...row } : null;
      },
      rotate: async (id, update) => {
        const row = staged.get(id)!;
        Object.assign(row, {
          refreshTokenHash: update.refreshTokenHash,
          previousRefreshTokenHash: update.previousRefreshTokenHash,
          expiresAt: update.expiresAt,
          updatedAt: update.now,
        });
      },
      revoke: async (id, now) => {
        const row = staged.get(id);
        if (row && !row.revokedAt) Object.assign(row, { revokedAt: now, updatedAt: now });
      },
    };
    const result = await work(tx); // a throw here skips the commit below
    this.rows = staged;
    return result;
  }

  async getActiveWithUser(id: string, userId: string, now: Date): Promise<ActiveMobileSession | null> {
    if (this.fail) throw new Error("db down");
    const row = this.rows.get(id);
    const user = row ? this.users.get(row.userId) : undefined;
    if (!row || !user || row.userId !== userId || row.revokedAt || row.expiresAt <= now || user.deleted) return null;
    return { sessionId: row.id, userId: row.userId, platform: row.platform, role: user.role, status: user.status };
  }

  /** Seeds a session whose current secret is `secret` (and optionally a previous one). */
  seed(options: { id?: string; userId?: string; secret?: string; previousSecret?: string; revokedAt?: Date; expiresAt?: Date } = {}) {
    const id = options.id ?? SID;
    const token = generateRefreshToken(id).token;
    const secret = options.secret ?? parseRefreshToken(token)!.secret;
    this.rows.set(id, {
      id,
      userId: options.userId ?? GOOGLE_USER,
      refreshTokenHash: hashRefreshSecret(secret),
      previousRefreshTokenHash: options.previousSecret ? hashRefreshSecret(options.previousSecret) : null,
      platform: "ios",
      expiresAt: options.expiresAt ?? new Date(NOW.getTime() + 60_000),
      revokedAt: options.revokedAt ?? null,
      createdAt: NOW,
      updatedAt: NOW,
    });
    return `${id}.${secret}`;
  }
}

function setup(now: Date = NOW) {
  const repo = new FakeRepository();
  repo.users.set(GOOGLE_USER, { role: "user", status: "active", deleted: false });
  repo.users.set(APPLE_USER, { role: "user", status: "active", deleted: false });
  const deps: MobileSessionDeps = { sessions: repo, config: () => CONFIG, now: () => now, newSessionId: () => SID };
  return { repo, deps };
}

function secretOf(token: string): string {
  return parseRefreshToken(token)!.secret;
}

async function bearerFor(deps: MobileSessionDeps, userId = GOOGLE_USER) {
  const created = await createMobileSession({ userId, platform: "ios" }, deps);
  assert.ok(created.ok);
  return { header: `Bearer ${created.tokens.accessToken}`, tokens: created.tokens };
}

/** Signs arbitrary access-token claims with the test secret. */
function forge(claims: Record<string, unknown>) {
  const iat = Math.floor(NOW.getTime() / 1000);
  return new SignJWT({ role: "user", authProvider: "google", iss: CONFIG.accessToken.issuer, aud: CONFIG.accessToken.audience, iat, exp: iat + 900, ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .sign(new TextEncoder().encode(CONFIG.accessToken.secret));
}

let errorLog: ReturnType<typeof mock.method>;
beforeEach(() => {
  errorLog = mock.method(console, "error", () => {});
});
afterEach(() => {
  mock.restoreAll();
});

describe("createMobileSession", () => {
  it("opens a session under a server-generated id and returns a plaintext <sid>.<secret> refresh token", async () => {
    const { repo, deps } = setup();
    const result = await createMobileSession({ userId: GOOGLE_USER, platform: "android" }, deps);
    assert.ok(result.ok);
    assert.equal(result.tokens.sessionId, SID);
    const parsed = parseRefreshToken(result.tokens.refreshToken);
    assert.equal(parsed?.sid, SID);
    assert.equal(repo.created.length, 1);
    assert.equal(repo.created[0].id, SID);
    assert.equal(repo.created[0].platform, "android");
    assert.equal(repo.created[0].userId, GOOGLE_USER);
  });

  it("stores only the secret's hash, never the token or the secret", async () => {
    const { repo, deps } = setup();
    const result = await createMobileSession({ userId: GOOGLE_USER, platform: "ios" }, deps);
    assert.ok(result.ok);
    const stored = repo.created[0];
    assert.equal(stored.refreshTokenHash, hashRefreshSecret(secretOf(result.tokens.refreshToken)));
    assert.ok(!JSON.stringify(stored).includes(secretOf(result.tokens.refreshToken)));
  });

  it("issues an access token for the user and session, with role user", async () => {
    const { deps } = setup();
    const result = await createMobileSession({ userId: APPLE_USER, platform: "ios" }, deps);
    assert.ok(result.ok);
    const claims = await verifyMobileAccessToken(result.tokens.accessToken, CONFIG.accessToken, NOW);
    assert.equal(claims?.sub, APPLE_USER);
    assert.equal(claims?.sid, SID);
    assert.equal(claims?.role, "user");
    assert.equal(claims?.authProvider, "apple");
    assert.equal(result.tokens.accessTokenExpiresAt.getTime(), NOW.getTime() + CONFIG.accessToken.ttlSeconds * 1000);
  });

  it("takes the session expiry from config", async () => {
    const { repo, deps } = setup();
    const result = await createMobileSession({ userId: GOOGLE_USER, platform: "ios" }, deps);
    assert.ok(result.ok);
    const expected = NOW.getTime() + CONFIG.sessionTtlSeconds * 1000;
    assert.equal(result.tokens.refreshTokenExpiresAt.getTime(), expected);
    assert.equal(repo.created[0].expiresAt.getTime(), expected);
  });

  it("fails closed on a database error or missing config", async () => {
    const { repo, deps } = setup();
    repo.fail = true;
    assert.deepEqual(await createMobileSession({ userId: GOOGLE_USER, platform: "ios" }, deps), { ok: false, error: "unavailable" });
    const noConfig = { ...setup().deps, config: () => { throw new Error("missing secret"); } };
    assert.deepEqual(await createMobileSession({ userId: GOOGLE_USER, platform: "ios" }, noConfig), { ok: false, error: "unavailable" });
  });
});

describe("refreshMobileSession", () => {
  it("rotates on the current secret: current → previous, new current, extended expiry, new tokens", async () => {
    const later = new Date(NOW.getTime() + 30_000);
    const { repo, deps } = setup(later);
    const token = repo.seed();
    const oldHash = repo.rows.get(SID)!.refreshTokenHash;

    const result = await refreshMobileSession(token, deps);
    assert.ok(result.ok);
    const row = repo.rows.get(SID)!;
    assert.equal(row.previousRefreshTokenHash, oldHash);
    assert.equal(row.refreshTokenHash, hashRefreshSecret(secretOf(result.tokens.refreshToken)));
    assert.notEqual(result.tokens.refreshToken, token);
    assert.equal(parseRefreshToken(result.tokens.refreshToken)?.sid, SID);
    assert.equal(row.expiresAt.getTime(), later.getTime() + CONFIG.sessionTtlSeconds * 1000);
    assert.equal(result.tokens.refreshTokenExpiresAt.getTime(), row.expiresAt.getTime());
    assert.equal(row.updatedAt.getTime(), later.getTime());
    const claims = await verifyMobileAccessToken(result.tokens.accessToken, CONFIG.accessToken, later);
    assert.equal(claims?.sub, GOOGLE_USER);
    assert.equal(claims?.sid, SID);
  });

  it("detects reuse of the previous secret, and commits the revocation", async () => {
    const { repo, deps } = setup();
    const first = repo.seed();
    const rotated = await refreshMobileSession(first, deps);
    assert.ok(rotated.ok);

    const reuse = await refreshMobileSession(first, deps);
    assert.deepEqual(reuse, { ok: false, error: "refresh-reuse-detected" });
    assert.equal(repo.rows.get(SID)!.revokedAt?.getTime(), NOW.getTime(), "revocation must be committed");

    // The legitimately rotated token is dead too.
    assert.deepEqual(await refreshMobileSession(rotated.tokens.refreshToken, deps), { ok: false, error: "session-revoked" });
  });

  it("treats a secret matching neither hash as invalid, without changing anything", async () => {
    const { repo, deps } = setup();
    repo.seed({ previousSecret: secretOf(generateRefreshToken(SID).token) });
    const before = { ...repo.rows.get(SID)! };
    const stranger = generateRefreshToken(SID).token;
    assert.deepEqual(await refreshMobileSession(stranger, deps), { ok: false, error: "session-invalid" });
    assert.deepEqual(repo.rows.get(SID), before);
  });

  it("refuses a revoked session", async () => {
    const { repo, deps } = setup();
    const token = repo.seed({ revokedAt: NOW });
    assert.deepEqual(await refreshMobileSession(token, deps), { ok: false, error: "session-revoked" });
  });

  it("refuses an expired session, including exactly at expiry", async () => {
    const { repo, deps } = setup();
    const token = repo.seed({ expiresAt: NOW });
    assert.deepEqual(await refreshMobileSession(token, deps), { ok: false, error: "session-expired" });
  });

  it("refuses an unknown session id", async () => {
    const { deps } = setup();
    assert.deepEqual(await refreshMobileSession(generateRefreshToken(OTHER_SID).token, deps), { ok: false, error: "session-invalid" });
  });

  it("refuses a malformed token without touching the database", async () => {
    const { repo, deps } = setup();
    for (const token of ["", "garbage", `${SID}.short`]) {
      assert.deepEqual(await refreshMobileSession(token, deps), { ok: false, error: "session-invalid" });
    }
    assert.equal(repo.transactions, 0);
  });

  it("reads the session row-locked, inside one transaction", async () => {
    const { repo, deps } = setup();
    await refreshMobileSession(repo.seed(), deps);
    assert.equal(repo.transactions, 1);
    assert.deepEqual(repo.locked, [SID]);
  });

  it("fails closed on a database error", async () => {
    const { repo, deps } = setup();
    const token = repo.seed();
    repo.fail = true;
    assert.deepEqual(await refreshMobileSession(token, deps), { ok: false, error: "unavailable" });
    assert.deepEqual(errorLog.mock.calls[0].arguments, ["[mobile-auth] refresh session failed", "Error"]);
  });
});

describe("revokeMobileSession", () => {
  it("revokes an active session with its current token", async () => {
    const { repo, deps } = setup();
    const token = repo.seed();
    assert.deepEqual(await revokeMobileSession(token, deps), { ok: true, status: "revoked" });
    assert.equal(repo.rows.get(SID)!.revokedAt?.getTime(), NOW.getTime());
  });

  it("is idempotent for an already-revoked session", async () => {
    const { repo, deps } = setup();
    const revokedAt = new Date(NOW.getTime() - 1000);
    const token = repo.seed({ revokedAt });
    assert.deepEqual(await revokeMobileSession(token, deps), { ok: true, status: "already-revoked" });
    assert.equal(repo.rows.get(SID)!.revokedAt?.getTime(), revokedAt.getTime());
  });

  it("succeeds quietly for an unknown session", async () => {
    const { deps } = setup();
    assert.deepEqual(await revokeMobileSession(generateRefreshToken(OTHER_SID).token, deps), { ok: true, status: "not-revoked" });
  });

  it("never revokes a session whose secret it doesn't hold", async () => {
    const { repo, deps } = setup();
    repo.seed({ id: SID });
    // Knowing the victim's session id isn't enough.
    const forged = generateRefreshToken(SID).token;
    assert.deepEqual(await revokeMobileSession(forged, deps), { ok: true, status: "not-revoked" });
    assert.equal(repo.rows.get(SID)!.revokedAt, null);
  });

  it("refuses a malformed token", async () => {
    const { deps } = setup();
    assert.deepEqual(await revokeMobileSession(SID, deps), { ok: false, error: "session-invalid" });
  });
});

describe("authenticateMobileRequest", () => {
  it("authenticates a valid Bearer token to the session's identity", async () => {
    const { deps } = setup();
    const { header } = await bearerFor(deps);
    assert.deepEqual(await authenticateMobileRequest(header, deps), {
      ok: true,
      identity: { userId: GOOGLE_USER, sessionId: SID, authProvider: "google", platform: "ios", status: "active" },
    });
  });

  it("rejects a missing header, a wrong scheme and a malformed value", async () => {
    const { deps } = setup();
    const { tokens } = await bearerFor(deps);
    for (const header of [undefined, null, "", `Basic ${tokens.accessToken}`, `bearer ${tokens.accessToken}`, "Bearer", "Bearer ", `Bearer ${tokens.accessToken} extra`]) {
      assert.deepEqual(await authenticateMobileRequest(header, deps), { ok: false, error: "unauthorized" }, String(header));
    }
  });

  it("rejects a token that fails verification", async () => {
    const { deps } = setup();
    for (const token of ["not-a-jwt", tokenWithSecret()]) {
      assert.deepEqual(await authenticateMobileRequest(`Bearer ${await token}`, deps), { ok: false, error: "unauthorized" });
    }

    async function tokenWithSecret() {
      return new SignJWT({ sid: SID, role: "user", authProvider: "google" })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(GOOGLE_USER)
        .sign(new TextEncoder().encode("a-different-secret-of-at-least-32-bytes"));
    }
  });

  it("rejects a token without sid or sub", async () => {
    const { deps } = setup();
    await bearerFor(deps);
    assert.deepEqual(await authenticateMobileRequest(`Bearer ${await forge({ sub: GOOGLE_USER })}`, deps), { ok: false, error: "unauthorized" });
    assert.deepEqual(await authenticateMobileRequest(`Bearer ${await forge({ sid: SID })}`, deps), { ok: false, error: "unauthorized" });
  });

  it("rejects a missing, revoked or expired session, and a deleted account", async () => {
    const missing = setup();
    assert.deepEqual(await authenticateMobileRequest(`Bearer ${await forge({ sub: GOOGLE_USER, sid: SID })}`, missing.deps), {
      ok: false,
      error: "unauthorized",
    });

    const revoked = setup();
    const r = await bearerFor(revoked.deps);
    assert.deepEqual(await revokeMobileSession(r.tokens.refreshToken, revoked.deps), { ok: true, status: "revoked" });
    assert.deepEqual(await authenticateMobileRequest(r.header, revoked.deps), { ok: false, error: "unauthorized" });

    const expired = setup();
    const e = await bearerFor(expired.deps);
    expired.repo.rows.get(SID)!.expiresAt = NOW;
    assert.deepEqual(await authenticateMobileRequest(e.header, expired.deps), { ok: false, error: "unauthorized" });

    const deleted = setup();
    const d = await bearerFor(deleted.deps);
    deleted.repo.users.get(GOOGLE_USER)!.deleted = true;
    assert.deepEqual(await authenticateMobileRequest(d.header, deleted.deps), { ok: false, error: "unauthorized" });
  });

  it("rejects a token whose sub doesn't own the session", async () => {
    const { repo, deps } = setup();
    repo.seed({ id: SID, userId: GOOGLE_USER });
    repo.users.set("google-sub-2", { role: "user", status: "active", deleted: false });
    const token = await forge({ sub: "google-sub-2", sid: SID });
    assert.deepEqual(await authenticateMobileRequest(`Bearer ${token}`, deps), { ok: false, error: "unauthorized" });
  });

  it("rejects a provider claim that disagrees with the account id", async () => {
    const { repo, deps } = setup();
    repo.seed({ id: SID, userId: GOOGLE_USER });
    const token = await forge({ sub: GOOGLE_USER, sid: SID, authProvider: "apple" });
    assert.deepEqual(await authenticateMobileRequest(`Bearer ${token}`, deps), { ok: false, error: "unauthorized" });
  });

  it("refuses an account whose stored role is admin, whatever the token says", async () => {
    const { repo, deps } = setup();
    const { header } = await bearerFor(deps);
    repo.users.get(GOOGLE_USER)!.role = "admin";
    assert.deepEqual(await authenticateMobileRequest(header, deps), { ok: false, error: "admin-account" });
  });

  it("never trusts the token's role", async () => {
    const { repo, deps } = setup();
    repo.seed({ id: SID, userId: GOOGLE_USER });
    // A token claiming admin isn't even a valid mobile token.
    const elevated = await forge({ sub: GOOGLE_USER, sid: SID, role: "admin" });
    assert.deepEqual(await authenticateMobileRequest(`Bearer ${elevated}`, deps), { ok: false, error: "unauthorized" });
  });

  it("still authenticates a suspended account, like the web session", async () => {
    const { repo, deps } = setup();
    const { header } = await bearerFor(deps);
    repo.users.get(GOOGLE_USER)!.status = "suspended";
    const result = await authenticateMobileRequest(header, deps);
    assert.ok(result.ok);
    assert.equal(result.identity.status, "suspended");
  });

  it("fails closed on a database error", async () => {
    const { repo, deps } = setup();
    const { header } = await bearerFor(deps);
    repo.fail = true;
    assert.deepEqual(await authenticateMobileRequest(header, deps), { ok: false, error: "unavailable" });
    assert.ok(!JSON.stringify(errorLog.mock.calls.map((call) => call.arguments)).includes(header.slice(7)));
  });
});
