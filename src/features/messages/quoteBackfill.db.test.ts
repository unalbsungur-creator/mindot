import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { QUOTE_BACKFILL_PLAN, runQuoteBackfill } from "./lib/quoteBackfill";

// MB-01 quote backfill against real PostgreSQL (after 0029): the dry run
// writes nothing, --apply writes exactly the planned attribution columns in
// one transaction, a second run changes nothing, and cards outside the plan
// or protected ones are never touched. `npm run test:db:quote-backfill`.

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

describe("quote backfill on PostgreSQL", { skip: TEST_URL ? false : "TOKEN_TEST_DATABASE_URL is not set" }, () => {
  let sql: ReturnType<typeof postgres>;
  const marcus = QUOTE_BACKFILL_PLAN.find((entry) => entry.quoteAuthor === "Marcus Aurelius")!;
  const unknown = QUOTE_BACKFILL_PLAN.find((entry) => entry.id.startsWith("2b2954ff"))!;
  const edited = QUOTE_BACKFILL_PLAN.find((entry) => entry.id.startsWith("825e6135"))!;
  const founderSigned = QUOTE_BACKFILL_PLAN.find((entry) => entry.id.startsWith("eba403ff"))!;
  const outside = "45e05473-d336-425a-a0ac-2e72d8e8d119";

  async function insert(id: string, content: string, authorName: string, isAnonymous = false) {
    await sql`
      insert into messages (id, content, author_id, author_name, is_anonymous, status, language, template_id, consent_version)
      values (${id}, ${content}, 'backfill-user', ${authorName}, ${isAnonymous}, 'approved', 'tr', 'standard-classic', 'test')
    `;
  }
  const read = async (id: string) =>
    (await sql`select content, author_name, is_anonymous, is_quote, quote_author, status from messages where id = ${id}`)[0];

  before(async () => {
    delete process.env.APP_ENV;
    sql = postgres(TEST_URL!, { max: 2, onnotice: () => {} });
    await migrate(drizzle(sql), { migrationsFolder: "drizzle" });
    await sql`delete from message_likes`;
    await sql`delete from messages`;
    await sql`insert into users (id, email, role, name) values ('backfill-user', 'backfill@example.test', 'user', 'Account Name') on conflict do nothing`;
    await insert(marcus.id, "“En iyi intikam, sana zarar verene benzememektir.”", "Marcus Aurelius");
    await insert(unknown.id, "Derdini anlatacak kadar lisan bilen değil…", "La Edri");
    await insert(edited.id, "Bu kart sonradan değişti.", "Francis Bacon");
    await insert(founderSigned.id, "Habe Mut, dich deines eigenen Verstandes zu bedienen!", "Ünal Büyüksungur");
    await insert(outside, "Kedi arabanın altında kaldı. Pisi Pisine gitti.", "Ünal Büyüksungur");
  });

  after(async () => {
    await sql?.end({ timeout: 5 });
  });

  it("dry run: decides, writes nothing", async () => {
    const decisions = await runQuoteBackfill(sql, { apply: false });
    assert.equal(decisions.find((d) => d.id === marcus.id)?.action, "update");
    assert.equal((await read(marcus.id)).is_quote, false);
    assert.equal((await read(marcus.id)).author_name, "Marcus Aurelius");
  });

  it("apply: quote + anonymous sharer, never the account name; skips edited, protected and missing cards", async () => {
    const decisions = await runQuoteBackfill(sql, { apply: true });
    const m = await read(marcus.id);
    assert.deepEqual([m.is_quote, m.quote_author, m.is_anonymous, m.author_name, m.status], [true, "Marcus Aurelius", true, "anonymous", "approved"]);
    const u = await read(unknown.id);
    assert.deepEqual([u.is_quote, u.quote_author, u.is_anonymous, u.author_name], [true, null, true, "anonymous"]);
    for (const id of [edited.id, founderSigned.id, outside]) {
      const untouched = await read(id);
      assert.equal(untouched.is_quote, false, id);
      assert.notEqual(untouched.author_name, "anonymous", id);
    }
    assert.equal(decisions.find((d) => d.id === edited.id)?.action, "skip");
    assert.equal(decisions.find((d) => d.id === founderSigned.id)?.action, "skip");
    assert.ok(decisions.filter((d) => d.action === "skip" && d.reason === "missing").length >= 15);
    const all = await sql`select author_name from messages`;
    assert.ok(!all.some((row) => row.author_name === "Account Name"), "no account name was ever written");
  });

  it("is idempotent: a second run updates nothing", async () => {
    const decisions = await runQuoteBackfill(sql, { apply: true });
    assert.equal(decisions.filter((d) => d.action === "update").length, 0);
    assert.equal(decisions.find((d) => d.id === marcus.id)?.action, "unchanged");
  });

  it("refuses a database without migration 0029", async () => {
    const fake = (async () => [{ n: 0 }]) as unknown as ReturnType<typeof postgres>;
    await assert.rejects(runQuoteBackfill(fake, { apply: true }), /migration 0029/);
  });
});
