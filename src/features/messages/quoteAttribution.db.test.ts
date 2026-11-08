import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { getPublicMessageById } from "@/features/board/repository";
import { CONTENT_CONSENT_VERSION } from "./consent";
import type { QuoteAttribution } from "./lib/quoteAttribution";
import { messageRepository } from "./repository";

// MB-01 quote attribution (migration 0029) against real PostgreSQL: the
// columns' defaults and CHECK constraints, the repository's write/read
// mapping, the public board contract, the pending-revision flow and a
// moderator's correction. Run through `npm run test:db:quotes` (throwaway
// Docker Postgres, URL in TOKEN_TEST_DATABASE_URL). Skipped without one;
// refuses any URL that isn't the local throwaway test database.

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
const OWN: QuoteAttribution = { isQuote: false, quoteAuthor: null };

describe("messages quote attribution on PostgreSQL", { skip: TEST_URL ? false : "TOKEN_TEST_DATABASE_URL is not set" }, () => {
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

  async function writeMessage(authorId: string, attribution: QuoteAttribution) {
    return messageRepository.create({
      content: "Yaşamak bir ağaç gibi tek ve hür.",
      authorId,
      authorName: "Test Person",
      isAnonymous: false,
      language: "tr",
      templateId: "standard-classic",
      fontFamily: "modern",
      textAlign: "auto",
      ...attribution,
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

  async function publishedQuote(author: string, admin: string, quoteAuthor: string | null) {
    const created = await writeMessage(author, { isQuote: true, quoteAuthor });
    await messageRepository.approve(created.id, admin);
    return created;
  }

  it("reads a row written without the columns as own words — what every existing message gets", async () => {
    const author = await createUser();
    const id = uid("msg");
    await sql`
      insert into messages (id, content, author_id, author_name, language, template_id)
      values (${id}, 'Eski bir not.', ${author}, 'Test Person', 'tr', 'standard-classic')
    `;
    const message = await messageRepository.getById(id);
    assert.equal(message?.isQuote, false);
    assert.equal(message?.quoteAuthor, null);
    assert.equal(message?.pendingIsQuote, null);
  });

  it("stores a named quote, an unknown-author quote and own words as written", async () => {
    const author = await createUser();
    const named = await writeMessage(author, { isQuote: true, quoteAuthor: "Nâzım Hikmet" });
    const unknown = await writeMessage(author, { isQuote: true, quoteAuthor: null });
    const own = await writeMessage(author, OWN);
    assert.deepEqual([named.isQuote, named.quoteAuthor], [true, "Nâzım Hikmet"]);
    assert.deepEqual([unknown.isQuote, unknown.quoteAuthor], [true, null]);
    assert.deepEqual([own.isQuote, own.quoteAuthor], [false, null]);
  });

  it("refuses an author on own words, an empty author and one over 80 characters (CHECK)", async () => {
    const author = await createUser();
    const insert = (isQuote: boolean, quoteAuthor: string) => sql`
      insert into messages (id, content, author_id, author_name, language, template_id, is_quote, quote_author)
      values (${uid("msg")}, 'x', ${author}, 'Test Person', 'tr', 'standard-classic', ${isQuote}, ${quoteAuthor})
    `;
    await assert.rejects(insert(false, "Birisi"), /messages_quote_author_check/);
    await assert.rejects(insert(true, ""), /messages_quote_author_check/);
    await assert.rejects(insert(true, "a".repeat(81)), /messages_quote_author_check/);
    await insert(true, "ğ".repeat(80));
  });

  it("puts the quote on the public board contract", async () => {
    const author = await createUser();
    const admin = await createUser("admin");
    const created = await publishedQuote(author, admin, "Orhan Veli");
    const pub = await getPublicMessageById(created.id);
    assert.equal(pub?.isQuote, true);
    assert.equal(pub?.quoteAuthor, "Orhan Veli");
  });

  it("keeps a changed author pending until approval — the live card is unchanged meanwhile", async () => {
    const author = await createUser();
    const admin = await createUser("admin");
    const created = await publishedQuote(author, admin, "Nazım Hikmet");

    const pending = await messageRepository.submitRevision(created.id, author, created.content, { isQuote: true, quoteAuthor: "Nâzım Hikmet" });
    assert.equal(pending?.quoteAuthor, "Nazım Hikmet");
    assert.equal(pending?.pendingIsQuote, true);
    assert.equal(pending?.pendingQuoteAuthor, "Nâzım Hikmet");
    assert.equal((await getPublicMessageById(created.id))?.quoteAuthor, "Nazım Hikmet");

    const approved = await messageRepository.approveRevision(created.id, admin);
    assert.deepEqual([approved?.isQuote, approved?.quoteAuthor, approved?.pendingIsQuote, approved?.pendingQuoteAuthor], [true, "Nâzım Hikmet", null, null]);
  });

  it("can turn own words into a quote, and a quote back into own words, only through review", async () => {
    const author = await createUser();
    const admin = await createUser("admin");
    const own = await writeMessage(author, OWN);
    await messageRepository.approve(own.id, admin);
    await messageRepository.submitRevision(own.id, author, own.content, { isQuote: true, quoteAuthor: null });
    assert.deepEqual(
      [(await messageRepository.approveRevision(own.id, admin))?.isQuote, (await messageRepository.getById(own.id))?.quoteAuthor],
      [true, null]
    );

    await messageRepository.submitRevision(own.id, author, own.content, OWN);
    const back = await messageRepository.approveRevision(own.id, admin);
    assert.deepEqual([back?.isQuote, back?.quoteAuthor], [false, null]);
  });

  it("discards a rejected revision's attribution with its text", async () => {
    const author = await createUser();
    const admin = await createUser("admin");
    const created = await publishedQuote(author, admin, "Cemal Süreya");
    await messageRepository.submitRevision(created.id, author, "Yeni metin.", OWN);
    const rejected = await messageRepository.rejectRevision(created.id, admin, null);
    assert.deepEqual(
      [rejected?.content, rejected?.isQuote, rejected?.quoteAuthor, rejected?.pendingIsQuote, rejected?.pendingQuoteAuthor],
      [created.content, true, "Cemal Süreya", null, null]
    );
  });

  it("keeps the live attribution for a revision submitted before MB-01 (no pending attribution)", async () => {
    const author = await createUser();
    const admin = await createUser("admin");
    const created = await publishedQuote(author, admin, "Can Yücel");
    // What a revision in flight at deploy time looks like: pending text, no pending attribution.
    await sql`update messages set pending_content = 'Eski düzenleme.', revision_submitted_at = now() where id = ${created.id}`;
    const approved = await messageRepository.approveRevision(created.id, admin);
    assert.deepEqual([approved?.content, approved?.isQuote, approved?.quoteAuthor], ["Eski düzenleme.", true, "Can Yücel"]);
  });

  it("lets a moderator correct a quote's author — live and proposed — but never on own words", async () => {
    const author = await createUser();
    const admin = await createUser("admin");
    const created = await publishedQuote(author, admin, "Nazim Hikmet");
    await messageRepository.submitRevision(created.id, author, "Düzeltilmiş metin.", { isQuote: true, quoteAuthor: "Nazim Hikmet" });

    const corrected = await messageRepository.setQuoteAuthor(created.id, "Nâzım Hikmet");
    assert.deepEqual([corrected?.quoteAuthor, corrected?.pendingQuoteAuthor], ["Nâzım Hikmet", "Nâzım Hikmet"]);
    const unknown = await messageRepository.setQuoteAuthor(created.id, null);
    assert.deepEqual([unknown?.isQuote, unknown?.quoteAuthor], [true, null]);

    const own = await writeMessage(author, OWN);
    assert.equal(await messageRepository.setQuoteAuthor(own.id, "Birisi"), null);
    assert.equal((await messageRepository.getById(own.id))?.quoteAuthor, null);
  });

  it("corrects only the proposal when own words are being turned into a quote", async () => {
    const author = await createUser();
    const admin = await createUser("admin");
    const own = await writeMessage(author, OWN);
    await messageRepository.approve(own.id, admin);
    await messageRepository.submitRevision(own.id, author, own.content, { isQuote: true, quoteAuthor: "Sait Faik" });
    const corrected = await messageRepository.setQuoteAuthor(own.id, "Sait Faik Abasıyanık");
    assert.deepEqual(
      [corrected?.isQuote, corrected?.quoteAuthor, corrected?.pendingIsQuote, corrected?.pendingQuoteAuthor],
      [false, null, true, "Sait Faik Abasıyanık"]
    );
  });
});
