import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { runDeletedInvitationUnlink } from "./lib/deletedInvitationUnlink";

// Security pack 2b — the cleanup for accounts deleted before deleteAccount cut
// the invitation trail, against real PostgreSQL. Run through
// `npm run test:db:deleted-invitations` (its own throwaway Docker Postgres).

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

describe("deleted-account invitation cleanup on PostgreSQL", { skip: TEST_URL ? false : "TOKEN_TEST_DATABASE_URL is not set" }, () => {
  let sql: ReturnType<typeof postgres>;

  before(async () => {
    delete process.env.APP_ENV;
    sql = postgres(TEST_URL!, { max: 2, onnotice: () => {} });
    await migrate(drizzle(sql), { migrationsFolder: "drizzle" });
  });

  after(async () => {
    await sql?.end({ timeout: 5 });
  });

  const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

  it("dry-runs without writing, then clears exactly the deleted accounts' trail, idempotently", async () => {
    const active = uid("user");
    const stone = `deleted_${crypto.randomUUID()}`;
    await sql`insert into users (id, email, role, name) values (${active}, ${`${active}@example.test`}, 'user', 'Active')`;
    await sql`insert into users (id, email, role, deleted_at) values (${stone}, ${`${stone}@deleted.invalid`}, 'user', now())`;

    const invite = async (recipient: string | null) => {
      const id = uid("inv");
      await sql`insert into invitations (id, token, recipient_email) values (${id}, ${uid("tok")}, ${recipient})`;
      return id;
    };
    const card = async (author: string, invitationId: string | null) => {
      const id = uid("msg");
      await sql`insert into messages (id, content, author_id, author_name, is_anonymous, language, template_id, status, invitation_id)
        values (${id}, 'x', ${author}, 'anonymous', true, 'en', 'standard-classic', 'approved', ${invitationId})`;
      return id;
    };
    const deletedOnly = await invite("former@example.test");
    const shared = await invite("someone@example.test");
    const activeOnly = await invite("active@example.test");
    const stoneCard = await card(stone, deletedOnly);
    const stoneCard2 = await card(stone, shared);
    const activeCard = await card(active, shared);
    const activeCard2 = await card(active, activeOnly);

    const snapshot = [await sql`select id, recipient_email from invitations order by id`, await sql`select id, invitation_id from messages order by id`];
    const dry = await runDeletedInvitationUnlink(sql, { apply: false });
    assert.equal(dry.applied, false);
    assert.ok(dry.cardIds.includes(stoneCard) && dry.cardIds.includes(stoneCard2));
    assert.ok(dry.invitationIds.includes(deletedOnly) && dry.invitationIds.includes(shared));
    assert.ok(!dry.invitationIds.includes(activeOnly));
    assert.ok(dry.sharedWithActiveAuthors >= 1);
    assert.deepEqual([await sql`select id, recipient_email from invitations order by id`, await sql`select id, invitation_id from messages order by id`], snapshot);

    const applied = await runDeletedInvitationUnlink(sql, { apply: true });
    assert.equal(applied.applied, true);
    assert.ok(applied.invitationsCleared >= 2 && applied.cardsUnlinked >= 2);

    const emails = new Map(
      (await sql<{ id: string; recipient_email: string | null }[]>`select id, recipient_email from invitations where id in (${deletedOnly}, ${shared}, ${activeOnly})`).map(
        (r) => [r.id, r.recipient_email]
      )
    );
    assert.equal(emails.get(deletedOnly), null);
    assert.equal(emails.get(shared), null);
    assert.equal(emails.get(activeOnly), "active@example.test");
    const links = new Map(
      (await sql<{ id: string; invitation_id: string | null }[]>`select id, invitation_id from messages where id in (${stoneCard}, ${stoneCard2}, ${activeCard}, ${activeCard2})`).map(
        (r) => [r.id, r.invitation_id]
      )
    );
    assert.equal(links.get(stoneCard), null);
    assert.equal(links.get(stoneCard2), null);
    assert.equal(links.get(activeCard), shared, "an active author's own card keeps its link");
    assert.equal(links.get(activeCard2), activeOnly);

    const again = await runDeletedInvitationUnlink(sql, { apply: true });
    assert.deepEqual([again.cardIds.length, again.invitationIds.length, again.invitationsCleared, again.cardsUnlinked], [0, 0, 0, 0]);
  });
});
