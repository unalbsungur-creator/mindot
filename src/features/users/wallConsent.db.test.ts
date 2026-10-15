import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { PUBLIC_WALL_CONSENT_VERSION } from "@/features/profile/lib/wallConsent";
import { getPublicWall } from "@/features/profile/repository";
import { userRepository } from "./repository";

// users.public_wall_consent_version / _at (migration 0025) against real
// PostgreSQL: the paired CHECK, the one-UPDATE enable, turning off keeping
// the consent, getPublicWall closing an unconsented wall, and account
// deletion still removing the row. Run through `npm run test:db:wall-consent`
// (throwaway Docker Postgres, URL in TOKEN_TEST_DATABASE_URL). Skipped
// without one; refuses any URL that isn't the local throwaway test database.

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

describe("public wall consent on PostgreSQL", { skip: TEST_URL ? false : "TOKEN_TEST_DATABASE_URL is not set" }, () => {
  let sql: ReturnType<typeof postgres>;

  before(async () => {
    delete process.env.APP_ENV;
    // getDb() reads DATABASE_URL lazily, on the first query — point it at the test database only.
    process.env.DATABASE_URL = TEST_URL!;
    sql = postgres(TEST_URL!, { max: 2, onnotice: () => {} });
    await migrate(drizzle(sql), { migrationsFolder: "drizzle" });
  });

  after(async () => {
    await sql?.end({ timeout: 5 });
    await (globalThis as { mindotSql?: ReturnType<typeof postgres> }).mindotSql?.end({ timeout: 5 });
  });

  const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

  /** A wall turned on the pre-0025 way: enabled, no consent recorded. */
  async function createUser(publicWallEnabled = false): Promise<{ id: string; publicId: string }> {
    const id = uid("user");
    const publicId = uid("pub").slice(0, 20);
    await sql`
      insert into users (id, email, role, name, public_id, public_wall_enabled)
      values (${id}, ${`${id}@example.test`}, 'user', 'Test Person', ${publicId}, ${publicWallEnabled})`;
    return { id, publicId };
  }

  it("leaves existing rows without consent", async () => {
    const { id } = await createUser(true);
    const [row] = await sql`select public_wall_consent_version, public_wall_consent_at from users where id = ${id}`;
    assert.deepEqual([row.public_wall_consent_version, row.public_wall_consent_at], [null, null]);
  });

  it("refuses a consent version without its time, and a time without its version", async () => {
    const { id } = await createUser();
    const isPairCheck = (error: { code?: string; constraint_name?: string }) =>
      error.code === "23514" && error.constraint_name === "users_public_wall_consent_pair";
    await assert.rejects(sql`update users set public_wall_consent_version = '1.0' where id = ${id}`, isPairCheck);
    await assert.rejects(sql`update users set public_wall_consent_at = now() where id = ${id}`, isPairCheck);
    await sql`update users set public_wall_consent_version = '1.0', public_wall_consent_at = now() where id = ${id}`;
  });

  it("keeps a wall turned on before consent existed closed, and opens it once consent is given", async () => {
    const { id, publicId } = await createUser(true);
    assert.equal((await getPublicWall(publicId)).status, "disabled");

    const before = Date.now();
    const updated = await userRepository.enablePublicWallWithConsent(id, PUBLIC_WALL_CONSENT_VERSION);
    assert.equal(updated?.publicWallEnabled, true);
    assert.equal(updated?.publicWallConsentVersion, PUBLIC_WALL_CONSENT_VERSION);
    const consentAt = Date.parse(updated?.publicWallConsentAt ?? "");
    assert.ok(Math.abs(consentAt - before) < 60_000, "the database's own clock, now");

    assert.equal((await getPublicWall(publicId)).status, "ok");
  });

  it("closes a wall consented under an older version", async () => {
    const { id, publicId } = await createUser();
    await userRepository.enablePublicWallWithConsent(id, PUBLIC_WALL_CONSENT_VERSION);
    await sql`update users set public_wall_consent_version = '0.9' where id = ${id}`;
    assert.equal((await getPublicWall(publicId)).status, "disabled");
  });

  it("turns the wall off and keeps the last consent on record", async () => {
    const { id, publicId } = await createUser();
    const enabled = await userRepository.enablePublicWallWithConsent(id, PUBLIC_WALL_CONSENT_VERSION);
    const disabled = await userRepository.disablePublicWall(id);
    assert.equal(disabled?.publicWallEnabled, false);
    assert.equal(disabled?.publicWallConsentVersion, PUBLIC_WALL_CONSENT_VERSION);
    assert.equal(disabled?.publicWallConsentAt, enabled?.publicWallConsentAt);
    assert.equal((await getPublicWall(publicId)).status, "disabled");
  });

  it("never turns on a wall for an unknown account", async () => {
    assert.equal(await userRepository.enablePublicWallWithConsent(uid("missing"), PUBLIC_WALL_CONSENT_VERSION), null);
  });

  it("deletes the consent together with the account", async () => {
    const { id } = await createUser();
    await userRepository.enablePublicWallWithConsent(id, PUBLIC_WALL_CONSENT_VERSION);
    assert.deepEqual(await userRepository.deleteAccount(id), { status: "deleted" });
    const rows = await sql`select 1 from users where id = ${id}`;
    assert.equal(rows.length, 0);
  });
});
