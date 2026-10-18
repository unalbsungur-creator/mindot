import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { verifyAdminCredentials } from "@/features/auth/service";
import { hashPassword } from "./lib/password";
import { LOCKOUT_MINUTES, MAX_FAILED_LOGIN_ATTEMPTS, userRepository } from "./repository";

// The admin credentials lockout (userRepository.recordFailedLogin /
// recordSuccessfulLogin, driven through verifyAdminCredentials) against real
// PostgreSQL — above all that an expired lockout starts a fresh count instead
// of re-locking on the next single failure. Time is passed in explicitly.
// Run through `npm run test:db:admin-lockout` (throwaway Docker Postgres,
// URL in TOKEN_TEST_DATABASE_URL). Skipped without one; refuses any URL that
// isn't the local throwaway test database.

function localTestUrl(): string | null {
  const raw = process.env.TOKEN_TEST_DATABASE_URL;
  if (!raw) return null;
  const url = new URL(raw);
  if (url.hostname !== "127.0.0.1" || url.pathname !== "/mindot_token_test") {
    throw new Error("TOKEN_TEST_DATABASE_URL must point at the local mindot_token_test database");
  }
  return raw;
}

const TEST_URL = localTestUrl();
const PASSWORD = "correct horse battery staple";
const T0 = new Date("2026-10-18T12:00:00.000Z");
const LOCK_MS = LOCKOUT_MINUTES * 60_000;
const at = (ms: number) => new Date(T0.getTime() + ms);

after(async () => {
  await (globalThis as { mindotSql?: ReturnType<typeof postgres> }).mindotSql?.end({ timeout: 5 });
});

describe("admin credentials lockout on PostgreSQL", { skip: TEST_URL ? false : "TOKEN_TEST_DATABASE_URL is not set" }, () => {
  let sql: ReturnType<typeof postgres>;
  let passwordHash: string;

  before(async () => {
    delete process.env.APP_ENV;
    process.env.DATABASE_URL = TEST_URL!;
    sql = postgres(TEST_URL!, { max: 2, onnotice: () => {} });
    await migrate(drizzle(sql), { migrationsFolder: "drizzle" });
    passwordHash = await hashPassword(PASSWORD);
  });

  after(async () => {
    await sql?.end({ timeout: 5 });
  });

  async function createAdmin(state: { attempts?: number; lockedUntil?: Date | null; role?: "user" | "admin"; status?: "active" | "suspended" } = {}) {
    const id = `admin-${crypto.randomUUID()}`;
    const email = `${id}@example.test`;
    await sql`
      insert into users (id, email, role, name, password_hash, status, failed_login_attempts, locked_until)
      values (${id}, ${email}, ${state.role ?? "admin"}, 'Admin', ${passwordHash}, ${state.status ?? "active"},
              ${state.attempts ?? 0}, ${state.lockedUntil?.toISOString() ?? null})`;
    return { id, email };
  }

  async function lockState(id: string): Promise<{ attempts: number; lockedUntil: string | null }> {
    const [row] = await sql<{ attempts: number; lockedUntil: string | null }[]>`
      select failed_login_attempts as attempts, to_char(locked_until at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "lockedUntil"
      from users where id = ${id}`;
    return row;
  }

  const signIn = (email: string, password: string, now: Date) => verifyAdminCredentials({ email, password }, now);

  async function failTimes(email: string, times: number, now: Date) {
    for (let i = 0; i < times; i++) assert.equal(await signIn(email, "wrong", now), null);
  }

  it("signs in with the right password", async () => {
    const { id, email } = await createAdmin();
    assert.deepEqual(await signIn(email, PASSWORD, T0), { id, name: "Admin", role: "admin" });
    assert.deepEqual(await lockState(id), { attempts: 0, lockedUntil: null });
  });

  it("counts failures 1–4 without locking, and locks on the fifth", async () => {
    const { id, email } = await createAdmin();
    await failTimes(email, 1, T0);
    assert.deepEqual(await lockState(id), { attempts: 1, lockedUntil: null });
    await failTimes(email, 3, T0);
    assert.deepEqual(await lockState(id), { attempts: 4, lockedUntil: null });
    await failTimes(email, 1, T0);
    assert.deepEqual(await lockState(id), { attempts: MAX_FAILED_LOGIN_ATTEMPTS, lockedUntil: at(LOCK_MS).toISOString() });
  });

  it("refuses a wrong and the right password during the lock, leaving the lock untouched", async () => {
    const { id, email } = await createAdmin();
    await failTimes(email, 5, T0);
    const locked = await lockState(id);
    assert.equal(await signIn(email, "wrong", at(LOCK_MS - 1)), null);
    assert.equal(await signIn(email, PASSWORD, at(LOCK_MS - 1)), null);
    assert.deepEqual(await lockState(id), locked);
  });

  it("starts a fresh count after the lock expires: one failure is attempt 1, not a new lock", async () => {
    const { id, email } = await createAdmin();
    await failTimes(email, 5, T0);
    const afterLock = at(LOCK_MS);
    assert.equal(await signIn(email, "wrong", afterLock), null);
    assert.deepEqual(await lockState(id), { attempts: 1, lockedUntil: null });
    // …so the right password still works straight after that failure.
    assert.ok(await signIn(email, PASSWORD, afterLock));
  });

  it("locks again only on the fifth new failure after an expired lock", async () => {
    const { id, email } = await createAdmin();
    await failTimes(email, 5, T0);
    const later = at(LOCK_MS + 60_000);
    await failTimes(email, 4, later);
    assert.deepEqual(await lockState(id), { attempts: 4, lockedUntil: null });
    await failTimes(email, 1, later);
    assert.deepEqual(await lockState(id), { attempts: 5, lockedUntil: new Date(later.getTime() + LOCK_MS).toISOString() });
  });

  it("signs in with the right password after the lock expires and clears everything", async () => {
    const { id, email } = await createAdmin();
    await failTimes(email, 5, T0);
    assert.ok(await signIn(email, PASSWORD, at(LOCK_MS + 1)));
    assert.deepEqual(await lockState(id), { attempts: 0, lockedUntil: null });
  });

  it("restarts counting from zero after a successful sign-in", async () => {
    const { id, email } = await createAdmin();
    await failTimes(email, 3, T0);
    assert.ok(await signIn(email, PASSWORD, T0));
    await failTimes(email, 1, T0);
    assert.deepEqual(await lockState(id), { attempts: 1, lockedUntil: null });
  });

  it("counts concurrent failures exactly and sets one lock, never extended while it is active", async () => {
    const { id } = await createAdmin();
    await Promise.all(Array.from({ length: 10 }, () => userRepository.recordFailedLogin(id, T0)));
    assert.deepEqual(await lockState(id), { attempts: 10, lockedUntil: at(LOCK_MS).toISOString() });

    // Failures that slipped past the lock check before the lock was written
    // (later `now`, lock still active) keep counting but never move lockedUntil.
    await Promise.all(Array.from({ length: 5 }, (_, i) => userRepository.recordFailedLogin(id, at(60_000 * (i + 1)))));
    assert.deepEqual(await lockState(id), { attempts: 15, lockedUntil: at(LOCK_MS).toISOString() });
  });

  it("handles rows written by the old code: an expired lock with a count ≥ 5, and a count ≥ 5 with no lock", async () => {
    const stale = await createAdmin({ attempts: 7, lockedUntil: at(-60_000) });
    await failTimes(stale.email, 1, T0);
    assert.deepEqual(await lockState(stale.id), { attempts: 1, lockedUntil: null });

    const unlocked = await createAdmin({ attempts: 5, lockedUntil: null });
    await failTimes(unlocked.email, 1, T0);
    assert.deepEqual(await lockState(unlocked.id), { attempts: 6, lockedUntil: at(LOCK_MS).toISOString() });
  });

  it("refuses unknown, non-admin and suspended accounts without touching any row", async () => {
    assert.equal(await signIn(`nobody-${crypto.randomUUID()}@example.test`, PASSWORD, T0), null);
    for (const state of [{ role: "user" as const }, { status: "suspended" as const }]) {
      const { id, email } = await createAdmin(state);
      assert.equal(await signIn(email, "wrong", T0), null);
      assert.equal(await signIn(email, PASSWORD, T0), null);
      assert.deepEqual(await lockState(id), { attempts: 0, lockedUntil: null });
    }
  });

  it("never applies to Google/Apple accounts, which have no password hash", async () => {
    const id = `google-${crypto.randomUUID()}`;
    const email = `${id}@example.test`;
    await sql`insert into users (id, email, role, name) values (${id}, ${email}, 'user', 'Person')`;
    assert.equal(await userRepository.getCredentialsByEmail(email), null);
    assert.equal(await signIn(email, PASSWORD, T0), null);
    assert.deepEqual(await lockState(id), { attempts: 0, lockedUntil: null });
  });

  it("keeps a locked admin an active account, so an existing session keeps working", async () => {
    const { id, email } = await createAdmin();
    await failTimes(email, 5, T0);
    assert.equal(await userRepository.isActiveAccount(id), true);
  });
});
