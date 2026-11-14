import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { messageRepository } from "@/features/messages/repository";
import { countPendingPriority } from "./alerts/repository";

// Security pack 2b — the deferred AI pre-screen against real PostgreSQL: a
// result is stored once, only into the ai_* columns, and the PRIORITY count
// sees only pending crisis cards. Run through `npm run test:db:prescreen`.

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

describe("deferred pre-screen on PostgreSQL", { skip: TEST_URL ? false : "TOKEN_TEST_DATABASE_URL is not set" }, () => {
  let sql: ReturnType<typeof postgres>;

  before(async () => {
    delete process.env.APP_ENV;
    process.env.DATABASE_URL = TEST_URL!;
    sql = postgres(TEST_URL!, { max: 2, onnotice: () => {} });
    await migrate(drizzle(sql), { migrationsFolder: "drizzle" });
    await sql`delete from message_likes`;
    await sql`delete from message_reports`;
    await sql`delete from notifications`;
    await sql`delete from messages`;
  });

  after(async () => {
    await sql?.end({ timeout: 5 });
    await (globalThis as { mindotSql?: ReturnType<typeof postgres> }).mindotSql?.end({ timeout: 5 });
  });

  const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

  async function card(status: string, categories: string[] | null = null): Promise<string> {
    const author = uid("user");
    await sql`insert into users (id, email, role, name) values (${author}, ${`${author}@example.test`}, 'user', 'T')`;
    const id = uid("msg");
    await sql`insert into messages (id, content, author_id, author_name, is_anonymous, language, template_id, status, ai_moderation_categories)
      values (${id}, 'x', ${author}, 'anonymous', true, 'tr', 'standard-classic', ${status}, ${categories})`;
    return id;
  }

  const result = {
    decision: "review" as const,
    provider: "workers-ai",
    categories: ["self_harm", "crisis"],
    reason: "possible risk",
    confidence: 0.8,
    moderatedAt: "2026-11-14T12:00:00.000Z",
  };

  it("stores a result once, touching only the ai_* columns", async () => {
    const id = await card("pending");
    const before = (await sql`select status, content, tile_x, updated_at from messages where id = ${id}`)[0];
    assert.equal(await messageRepository.recordPrescreen(id, result), true);
    assert.equal(await messageRepository.recordPrescreen(id, { ...result, decision: "safe", categories: [] }), false, "never overwritten");
    const row = (await sql`select status, content, tile_x, updated_at, ai_moderation_status::text as s, ai_moderation_provider as p,
      ai_moderation_categories as c, ai_moderation_confidence as conf from messages where id = ${id}`)[0];
    assert.deepEqual(
      { status: row.status, content: row.content, tile_x: row.tile_x, updated_at: row.updated_at },
      { status: before.status, content: before.content, tile_x: before.tile_x, updated_at: before.updated_at }
    );
    assert.deepEqual([row.s, row.p, row.c], ["review", "workers-ai", ["self_harm", "crisis"]]);
    assert.ok(Math.abs(row.conf - 0.8) < 1e-6);
    assert.equal(await messageRepository.recordPrescreen("missing", result), false);
  });

  it("counts only pending crisis cards as PRIORITY", async () => {
    const start = await countPendingPriority();
    await card("pending", ["crisis", "self_harm"]);
    await card("pending", ["hate"]);
    await card("approved", ["crisis"]);
    await card("pending", null);
    assert.equal(await countPendingPriority(), start + 1);
  });
});
