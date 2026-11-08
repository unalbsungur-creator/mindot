import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { selectHomeHeroMessages } from "@/app/_home/heroSelection";
import { CONTENT_CONSENT_VERSION } from "./consent";
import { messageRepository } from "./repository";

// MB-01 homepage cards against real PostgreSQL: only liked, approved cards
// count as "most liked"; the newest approved cards fill up; nothing pending,
// rejected or archived ever reaches the homepage. Run through
// `npm run test:db:home` (its own throwaway Docker Postgres: it empties the messages table).

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

describe("homepage card queries on PostgreSQL", { skip: TEST_URL ? false : "TOKEN_TEST_DATABASE_URL is not set" }, () => {
  let sql: ReturnType<typeof postgres>;

  before(async () => {
    delete process.env.APP_ENV;
    process.env.DATABASE_URL = TEST_URL!;
    sql = postgres(TEST_URL!, { max: 2, onnotice: () => {} });
    await migrate(drizzle(sql), { migrationsFolder: "drizzle" });
    // This file owns the homepage's view of the table: start from no messages at all.
    await sql`delete from message_likes`;
    await sql`delete from messages`;
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

  async function write(authorId: string, content: string) {
    return messageRepository.create({
      content,
      authorId,
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
  }

  it("fills up with the newest approved cards when fewer than 4 are liked, and never shows unpublished ones", async () => {
    const author = await createUser();
    const admin = await createUser("admin");
    const fans = await Promise.all([createUser(), createUser()]);
    const published: string[] = [];
    for (const content of ["bir", "iki", "üç", "dört", "beş"]) {
      const m = await write(author, content);
      await messageRepository.approve(m.id, admin);
      published.push(m.id);
      await new Promise((resolve) => setTimeout(resolve, 5)); // distinct createdAt
    }
    const pending = await write(author, "bekliyor");
    const rejected = await write(author, "reddedildi");
    await messageRepository.reject(rejected.id, admin);
    const archived = await write(author, "arşivlendi");
    await messageRepository.approve(archived.id, admin);
    await messageRepository.archive(archived.id, admin);

    // "iki" has 2 likes, "bir" 1; the rest none.
    await messageRepository.like(published[1], { userId: fans[0] });
    await messageRepository.like(published[1], { userId: fans[1] });
    await messageRepository.like(published[0], { userId: fans[0] });

    assert.deepEqual((await messageRepository.listTopLikedApproved([], 4)).map((m) => m.content), ["iki", "bir"]);

    const hero = await selectHomeHeroMessages(messageRepository);
    assert.equal(hero.mode, "latest");
    assert.deepEqual(hero.messages.map((m) => m.content), ["iki", "bir", "beş", "dört"]);
    for (const hidden of [pending.id, rejected.id, archived.id]) assert.ok(!hero.messages.some((m) => m.id === hidden));
  });

  it("shows the 4 most liked as “most liked” once 4 cards have likes", async () => {
    const fan = await createUser();
    const others = (await messageRepository.listNewestApproved([], 10)).filter((m) => m.likeCount === 0);
    for (const m of others.slice(0, 2)) await messageRepository.like(m.id, { userId: fan });
    const hero = await selectHomeHeroMessages(messageRepository);
    assert.equal(hero.mode, "top-liked");
    assert.equal(hero.messages.length, 4);
    assert.ok(hero.messages.every((m) => m.likeCount > 0));
    assert.equal(hero.messages[0].content, "iki");
  });
});
