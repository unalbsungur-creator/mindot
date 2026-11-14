import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { getTile } from "@/features/board/repository";
import { CONTENT_CONSENT_VERSION } from "./consent";
import { messageRepository } from "./repository";

// Security pack 2b — likes need an account, against real PostgreSQL: one like
// per account per card (the unique index, even under concurrency), taking a
// like back, counts that existing (older, browser-id) likes keep, and the
// viewer-only `likedByViewer` on the board tile. Run through
// `npm run test:db:likes` (its own throwaway Docker Postgres).

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

describe("likes on PostgreSQL", { skip: TEST_URL ? false : "TOKEN_TEST_DATABASE_URL is not set" }, () => {
  let sql: ReturnType<typeof postgres>;

  before(async () => {
    delete process.env.APP_ENV;
    process.env.DATABASE_URL = TEST_URL!;
    sql = postgres(TEST_URL!, { max: 2, onnotice: () => {} });
    await migrate(drizzle(sql), { migrationsFolder: "drizzle" });
  });

  after(async () => {
    await sql?.end({ timeout: 5 });
    await (globalThis as { mindotSql?: ReturnType<typeof postgres> }).mindotSql?.end({ timeout: 5 });
  });

  const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

  async function createUser(role: "user" | "admin" = "user"): Promise<string> {
    const id = uid("user");
    await sql`insert into users (id, email, role, name) values (${id}, ${`${id}@example.test`}, ${role}, 'Test Person')`;
    return id;
  }

  async function approvedMessage(): Promise<{ id: string; tileX: number; tileY: number }> {
    const author = await createUser();
    const admin = await createUser("admin");
    const m = await messageRepository.create({
      content: "beğeni testi",
      authorId: author,
      authorName: "Test Person",
      isAnonymous: false,
      language: "tr",
      templateId: "standard-classic",
      fontFamily: "modern",
      textAlign: "auto",
      isQuote: false,
      quoteAuthor: null,
      invitationId: null,
      aiModerationStatus: "review",
      aiModerationProvider: "test",
      aiModerationCategories: [],
      aiModerationReason: "test",
      aiModerationConfidence: null,
      aiModeratedAt: new Date().toISOString(),
      consentAccepted: true,
      consentVersion: CONTENT_CONSENT_VERSION,
    });
    const approved = await messageRepository.approve(m.id, admin);
    return { id: m.id, tileX: approved!.tileX!, tileY: approved!.tileY! };
  }

  const countOf = async (id: string) => (await sql`select like_count from messages where id = ${id}`)[0].like_count as number;

  it("keeps one like per account, even when the same account likes twice at once", async () => {
    const m = await approvedMessage();
    const fan = await createUser();
    const results = await Promise.all([
      messageRepository.like(m.id, { userId: fan }),
      messageRepository.like(m.id, { userId: fan }),
      messageRepository.like(m.id, { userId: fan }),
    ]);
    assert.equal(results.filter((r) => !r.alreadyLiked).length, 1);
    assert.equal(await countOf(m.id), 1);
    const rows = await sql`select count(*)::int as n from message_likes where message_id = ${m.id} and user_id = ${fan}`;
    assert.equal(rows[0].n, 1);
  });

  it("takes a like back, once, and never drops the count below what others gave", async () => {
    const m = await approvedMessage();
    const [a, b] = [await createUser(), await createUser()];
    await messageRepository.like(m.id, { userId: a });
    await messageRepository.like(m.id, { userId: b });
    assert.deepEqual(await messageRepository.unlike(m.id, { userId: a }), { ok: true, likeCount: 1, wasLiked: true });
    assert.deepEqual(await messageRepository.unlike(m.id, { userId: a }), { ok: true, likeCount: 1, wasLiked: false });
    assert.equal(await countOf(m.id), 1);
    // Liking again after taking it back works.
    assert.equal((await messageRepository.like(m.id, { userId: a })).likeCount, 2);
  });

  it("keeps likes recorded earlier under a browser id: they still count and an account can't remove them", async () => {
    const m = await approvedMessage();
    await sql`insert into message_likes (id, message_id, anonymous_id) values (${crypto.randomUUID()}, ${m.id}, 'old-browser-id')`;
    await sql`update messages set like_count = 1 where id = ${m.id}`;
    const fan = await createUser();
    assert.equal((await messageRepository.like(m.id, { userId: fan })).likeCount, 2);
    assert.equal((await messageRepository.unlike(m.id, { userId: fan })).likeCount, 1);
    assert.equal((await messageRepository.unlike(m.id, { userId: fan })).wasLiked, false);
    assert.equal(await countOf(m.id), 1);
  });

  it("refuses likes and take-backs on a card that isn't approved", async () => {
    const m = await approvedMessage();
    const fan = await createUser();
    await messageRepository.like(m.id, { userId: fan });
    await sql`update messages set status = 'archived' where id = ${m.id}`;
    assert.equal((await messageRepository.unlike(m.id, { userId: fan })).ok, false);
    assert.equal((await messageRepository.like(m.id, { userId: await createUser() })).ok, false);
    assert.equal(await countOf(m.id), 1);
  });

  it("tells only the viewer which cards they liked; the public tile carries no like state", async () => {
    const m = await approvedMessage();
    const [fan, other] = [await createUser(), await createUser()];
    await messageRepository.like(m.id, { userId: fan });
    assert.deepEqual(await messageRepository.listLikedMessageIds(fan, [m.id, "missing"]), [m.id]);
    assert.deepEqual(await messageRepository.listLikedMessageIds(fan, []), []);

    const find = (tile: Awaited<ReturnType<typeof getTile>>) => tile.messages.find((x) => x.id === m.id)!;
    assert.equal(find(await getTile(m.tileX, m.tileY, undefined, fan)).likedByViewer, true);
    assert.equal(find(await getTile(m.tileX, m.tileY, undefined, other)).likedByViewer, false);
    assert.ok(!("likedByViewer" in find(await getTile(m.tileX, m.tileY))));
  });
});
