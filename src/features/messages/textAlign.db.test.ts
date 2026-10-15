import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { getPublicMessageById, getTile } from "@/features/board/repository";
import type { NoteTextAlign } from "@/features/notes/types";
import { CONTENT_CONSENT_VERSION } from "./consent";
import { messageRepository } from "./repository";

// messages.text_align (migration 0024) against real PostgreSQL: the column's
// default and CHECK constraint, the repository's write/read mapping, the
// public board contract, and that a revision never changes it.
// Run through `npm run test:db:messages` (throwaway Docker Postgres, URL in
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

describe("messages.text_align on PostgreSQL", { skip: TEST_URL ? false : "TOKEN_TEST_DATABASE_URL is not set" }, () => {
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

  async function createUser(role: "user" | "admin" = "user"): Promise<string> {
    const id = uid("user");
    await sql`insert into users (id, email, role, name) values (${id}, ${`${id}@example.test`}, ${role}, 'Test Person')`;
    return id;
  }

  async function writeMessage(authorId: string, textAlign: NoteTextAlign, templateId = "standard-classic") {
    return messageRepository.create({
      content: "Bugün denize baktım.\nSonra eve döndüm.",
      authorId,
      authorName: "Test Person",
      isAnonymous: false,
      language: "tr",
      templateId,
      fontFamily: "modern",
      textAlign,
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

  it("defaults a row written without it to 'auto' — what every existing message gets", async () => {
    const author = await createUser();
    const id = uid("msg");
    await sql`
      insert into messages (id, content, author_id, author_name, is_anonymous, language, template_id, status)
      values (${id}, 'test', ${author}, 'Test Person', false, 'en', 'standard-classic', 'pending')`;
    const [row] = await sql`select text_align from messages where id = ${id}`;
    assert.equal(row.text_align, "auto");
    assert.equal((await messageRepository.getById(id))?.textAlign, "auto");
  });

  it("accepts exactly auto, left, center and right", async () => {
    const author = await createUser();
    for (const value of ["auto", "left", "center", "right"]) {
      const id = uid("msg");
      await sql`
        insert into messages (id, content, author_id, author_name, is_anonymous, language, template_id, status, text_align)
        values (${id}, 'test', ${author}, 'Test Person', false, 'en', 'standard-classic', 'pending', ${value})`;
    }
    for (const value of ["justify", "LEFT", "", "start"]) {
      await assert.rejects(
        sql`
          insert into messages (id, content, author_id, author_name, is_anonymous, language, template_id, status, text_align)
          values (${uid("msg")}, 'test', ${author}, 'Test Person', false, 'en', 'standard-classic', 'pending', ${value})`,
        (error: { code?: string; constraint_name?: string }) => error.code === "23514" && error.constraint_name === "messages_text_align_check",
        value
      );
    }
  });

  it("stores the writer's choice and returns it through the public board contract once approved", async () => {
    const author = await createUser();
    const admin = await createUser("admin");
    const created = await writeMessage(author, "right");
    assert.equal(created.textAlign, "right");
    const approved = await messageRepository.approve(created.id, admin);
    assert.ok(approved?.tileX !== null && approved?.tileX !== undefined);

    const detail = await getPublicMessageById(created.id);
    assert.equal(detail?.textAlign, "right");
    const tile = await getTile(approved!.tileX!, approved!.tileY!);
    assert.equal(tile.messages.find((m) => m.id === created.id)?.textAlign, "right");
  });

  it("keeps the stored alignment through a revision and its approval", async () => {
    const author = await createUser();
    const admin = await createUser("admin");
    const created = await writeMessage(author, "center");
    await messageRepository.approve(created.id, admin);

    assert.ok(await messageRepository.submitRevision(created.id, author, "Yeni metin.\nİkinci satır."));
    const revised = await messageRepository.approveRevision(created.id, admin);
    assert.equal(revised?.content, "Yeni metin.\nİkinci satır.");
    assert.equal(revised?.textAlign, "center");
    const [row] = await sql`select text_align from messages where id = ${created.id}`;
    assert.equal(row.text_align, "center");
  });

  it("stores a football card's choice as written — only rendering ignores it", async () => {
    const author = await createUser();
    const created = await writeMessage(author, "left", "sport-yellow-red");
    assert.equal(created.textAlign, "left");
  });
});
