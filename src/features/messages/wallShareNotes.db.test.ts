import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { PUBLIC_WALL_CONSENT_VERSION } from "@/features/profile/lib/wallConsent";
import { getPublicWall, getPublicWallShareNotes } from "@/features/profile/repository";
import { messageRepository } from "./repository";

// The wall share image's default cards against real PostgreSQL: the newest
// eligible cards, newest first, deterministic on equal timestamps, nothing
// ineligible, behind the same gate as the wall page. Run through
// `npm run test:db:wall-share` (throwaway Docker Postgres, URL in
// TOKEN_TEST_DATABASE_URL). Skipped without one; refuses any URL that isn't
// the local throwaway test database.

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

describe("newest public wall cards on PostgreSQL", { skip: TEST_URL ? false : "TOKEN_TEST_DATABASE_URL is not set" }, () => {
  let sql: ReturnType<typeof postgres>;
  const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
  const BASE = Date.UTC(2026, 0, 1);

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

  async function createOwner(consented: boolean): Promise<{ id: string; publicId: string }> {
    const id = uid("user");
    const publicId = uid("pub").slice(0, 20);
    if (consented) {
      await sql`
        insert into users (id, email, role, name, public_id, public_wall_enabled, public_wall_consent_version, public_wall_consent_at)
        values (${id}, ${`${id}@example.test`}, 'user', 'Wall Owner', ${publicId}, true, ${PUBLIC_WALL_CONSENT_VERSION}, now())`;
    } else {
      await sql`
        insert into users (id, email, role, name, public_id, public_wall_enabled)
        values (${id}, ${`${id}@example.test`}, 'user', 'Wall Owner', ${publicId}, true)`;
    }
    return { id, publicId };
  }

  async function insertMessage(
    authorId: string,
    id: string,
    minutes: number,
    fields: { status?: string; anonymous?: boolean; onWall?: boolean } = {}
  ) {
    await sql`
      insert into messages (id, content, author_id, author_name, is_anonymous, language, template_id, status, show_on_personal_wall, created_at)
      values (${id}, ${`content ${id}`}, ${authorId}, 'Wall Owner', ${fields.anonymous ?? false}, 'tr', 'classic-yellow',
              ${fields.status ?? "approved"}, ${fields.onWall ?? true}, ${new Date(BASE + minutes * 60_000).toISOString()})`;
  }

  it("returns the newest eligible cards, newest first, even past the wall's oldest-first 60", async () => {
    const { id } = await createOwner(true);
    // 65 eligible cards, one minute apart: e00 (oldest) … e64 (newest).
    for (let i = 0; i < 65; i++) await insertMessage(id, `e${String(i).padStart(2, "0")}-${id}`, i);
    const newest = await messageRepository.listNewestPublicByAuthor(id, 8);
    assert.deepEqual(newest.map((m) => m.id.slice(0, 3)), ["e64", "e63", "e62", "e61", "e60", "e59", "e58", "e57"]);
    // The wall page's own read still starts from the oldest and stops at 60 — e64 is not in it.
    const wallPage = await messageRepository.listPublicByAuthor(id, { limit: 60 });
    assert.ok(!wallPage.some((m) => m.id.startsWith("e64")));
  });

  it("honours the square/story limits", async () => {
    const { id } = await createOwner(true);
    for (let i = 0; i < 10; i++) await insertMessage(id, `l${i}-${id}`, i);
    assert.equal((await messageRepository.listNewestPublicByAuthor(id, 4)).length, 4);
    assert.equal((await messageRepository.listNewestPublicByAuthor(id, 8)).length, 8);
  });

  it("breaks equal timestamps deterministically, by id", async () => {
    const { id } = await createOwner(true);
    for (const suffix of ["c", "a", "d", "b"]) await insertMessage(id, `t-${suffix}-${id}`, 5);
    const first = (await messageRepository.listNewestPublicByAuthor(id, 4)).map((m) => m.id);
    const second = (await messageRepository.listNewestPublicByAuthor(id, 4)).map((m) => m.id);
    assert.deepEqual(first, second);
    assert.deepEqual(first, [...first].sort().reverse(), "id descending among equal times");
  });

  it("never includes anonymous, pending, rejected, archived, off-wall or another author's cards", async () => {
    const { id } = await createOwner(true);
    const other = await createOwner(true);
    await insertMessage(id, `ok-${id}`, 1);
    await insertMessage(id, `anon-${id}`, 9, { anonymous: true });
    await insertMessage(id, `pend-${id}`, 9, { status: "pending" });
    await insertMessage(id, `rej-${id}`, 9, { status: "rejected" });
    await insertMessage(id, `arch-${id}`, 9, { status: "archived" });
    await insertMessage(id, `off-${id}`, 9, { onWall: false });
    await insertMessage(other.id, `other-${other.id}`, 9);
    const newest = await messageRepository.listNewestPublicByAuthor(id, 8);
    assert.deepEqual(newest.map((m) => m.id), [`ok-${id}`]);
  });

  it("keeps the wall page's gate: no current consent → disabled, consent → the newest cards", async () => {
    const closed = await createOwner(false);
    await insertMessage(closed.id, `x-${closed.id}`, 1);
    assert.equal((await getPublicWallShareNotes(closed.publicId, 4)).status, "disabled");
    assert.equal((await getPublicWall(closed.publicId)).status, "disabled");
    assert.equal((await getPublicWallShareNotes("no-such-wall", 4)).status, "not-found");

    const open = await createOwner(true);
    for (let i = 0; i < 6; i++) await insertMessage(open.id, `o${i}-${open.id}`, i);
    const result = await getPublicWallShareNotes(open.publicId, 4);
    assert.equal(result.status, "ok");
    if (result.status === "ok") {
      assert.deepEqual(result.notes.map((n) => n.id.slice(0, 2)), ["o5", "o4", "o3", "o2"]);
      assert.equal(result.profile.displayName, "Wall Owner");
    }
  });
});
