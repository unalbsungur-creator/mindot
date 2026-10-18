import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import type { AppleRevokeOutcome } from "@/features/auth/lib/appleRevoke";
import { adminGrantIdempotencyKey, tokenRepository } from "@/features/tokens/repository";
import { deleteOwnAccountForUser, deleteUserAccount } from "./accountDeletion";
import { userRepository } from "./repository";

// Account deletion (userRepository.deleteAccount and the deleteUserAccount /
// deleteOwnAccountForUser wrappers around it) against real PostgreSQL: every
// foreign key to users.id, what is deleted vs anonymized onto the tombstone,
// and that a failure anywhere leaves the whole database exactly as it was.
// Apple is always a fake — no request ever leaves the machine.
// Run through `npm run test:db:account-deletion` (throwaway Docker Postgres,
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

after(async () => {
  await (globalThis as { mindotSql?: ReturnType<typeof postgres> }).mindotSql?.end({ timeout: 5 });
});

describe("account deletion on PostgreSQL", { skip: TEST_URL ? false : "TOKEN_TEST_DATABASE_URL is not set" }, () => {
  let sql: ReturnType<typeof postgres>;

  before(async () => {
    delete process.env.APP_ENV;
    process.env.DATABASE_URL = TEST_URL!;
    sql = postgres(TEST_URL!, { max: 2, onnotice: () => {} });
    await migrate(drizzle(sql), { migrationsFolder: "drizzle" });
  });

  after(async () => {
    await sql?.end({ timeout: 5 });
  });

  const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

  async function createUser(id = uid("test"), role: "user" | "admin" = "user"): Promise<string> {
    await sql`insert into users (id, email, role, name) values (${id}, ${`${id}@example.test`}, ${role}, 'Test Person')`;
    return id;
  }

  async function createMessage(authorId: string, status: string, extra: { likeCount?: number } = {}): Promise<string> {
    const id = uid("msg");
    await sql`
      insert into messages (id, content, author_id, author_name, is_anonymous, language, template_id, status, like_count)
      values (${id}, 'test', ${authorId}, 'Test Person', false, 'en', 'standard-classic', ${status}, ${extra.likeCount ?? 0})`;
    return id;
  }

  async function createProject(ownerId: string, messageId: string): Promise<string> {
    const id = uid("proj");
    await sql`
      insert into memory_projects (id, message_id, created_by, capture_mode, output_type)
      values (${id}, ${messageId}, ${ownerId}, 'note_only', 'personal_pdf')`;
    return id;
  }

  /** Every single-column foreign key to users.id, read from the catalog — so a new one is never missed. */
  async function userForeignKeys(): Promise<{ table: string; column: string }[]> {
    return sql<{ table: string; column: string }[]>`
      select c.conrelid::regclass::text as table, a.attname as column
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      where c.contype = 'f' and c.confrelid = 'public.users'::regclass and cardinality(c.conkey) = 1
      order by 1, 2`;
  }

  async function referencesTo(userId: string): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const { table, column } of await userForeignKeys()) {
      const [row] = await sql<{ n: number }[]>`select count(*)::int as n from ${sql(table)} where ${sql(column)} = ${userId}`;
      counts[`${table}.${column}`] = row.n;
    }
    return counts;
  }

  /** A digest of every row of every public table: equal before/after means nothing changed anywhere. */
  async function databaseFingerprint(): Promise<Record<string, string>> {
    const tables = await sql<{ tablename: string }[]>`select tablename from pg_tables where schemaname = 'public' order by 1`;
    const digest: Record<string, string> = {};
    for (const { tablename } of tables) {
      const [row] = await sql<{ h: string }[]>`
        select md5(coalesce(string_agg(t::text, '|' order by t::text), '')) as h from ${sql(tablename)} t`;
      digest[tablename] = row.h;
    }
    return digest;
  }

  /**
   * One account with a row behind every foreign key to users.id, plus
   * another person's rows that deletion must leave alone.
   */
  async function seedAccount(targetId?: string) {
    const target = await createUser(targetId);
    const other = await createUser();
    const third = await createUser();

    // Another person's approved message the target liked, moderated and reported.
    const othersMessage = await createMessage(other, "approved", { likeCount: 1 });
    // The target's messages: published with a pending edit; never published and unreferenced;
    // rejected but reported; pending but referenced by someone else's notification.
    const published = await createMessage(target, "approved", { likeCount: 1 });
    await sql`update messages set show_on_personal_wall = true, pending_content = 'edit', revision_submitted_at = now(),
      revision_rejection_reason = 'reason' where id = ${published}`;
    const unpublished = await createMessage(target, "pending");
    const rejectedReported = await createMessage(target, "rejected");
    const pendingNotified = await createMessage(target, "pending");

    // Admin-style audit columns pointing at the target (the account is a plain user; the
    // columns are still FKs that deleteAccount must re-point).
    await sql`update messages set moderated_by = ${target}, revision_reviewed_by = ${target} where id = ${othersMessage}`;
    await sql`update users set status_changed_by = ${target} where id = ${other}`;
    await sql`insert into invitations (id, token, created_by) values (${uid("inv")}, ${uid("tok")}, ${target})`;

    // Likes: the target's own like (deleted, count decremented) and someone else's like on
    // the target's published message (kept).
    await sql`insert into message_likes (id, message_id, user_id) values (${uid("like")}, ${othersMessage}, ${target})`;
    const othersLike = uid("like");
    await sql`insert into message_likes (id, message_id, user_id) values (${othersLike}, ${published}, ${other})`;

    // Reports: filed by the target (re-pointed) and reviewed by the target (re-pointed).
    const filedReport = uid("rep");
    await sql`insert into message_reports (id, message_id, reporter_id, reason) values (${filedReport}, ${othersMessage}, ${target}, 'spam')`;
    const reviewedReport = uid("rep");
    await sql`insert into message_reports (id, message_id, reporter_id, reason, status, reviewed_by, reviewed_at)
      values (${reviewedReport}, ${rejectedReported}, ${other}, 'spam', 'resolved', ${target}, now())`;

    // Notifications: the target's own (deleted) and someone else's about the target's message (kept).
    await sql`insert into notifications (id, recipient_user_id, type, message_id) values (${uid("ntf")}, ${target}, 'message_approved', ${published})`;
    const othersNotification = uid("ntf");
    await sql`insert into notifications (id, recipient_user_id, type, message_id)
      values (${othersNotification}, ${other}, 'message_rejected', ${pendingNotified})`;

    // Memory projects: a bare draft (deleted) and three with an order / a token unlock / a redeemed
    // code (re-pointed, with the order, unlock, code and the token ledger/wallet).
    const draftProject = await createProject(target, othersMessage);
    const orderedProject = await createProject(target, othersMessage);
    const orderId = uid("ord");
    await sql`insert into physical_orders (id, memory_project_id, order_number, created_by)
      values (${orderId}, ${orderedProject}, ${uid("MND")}, ${target})`;
    const unlockedProject = await createProject(target, published);
    const granted = await tokenRepository.grantByAdmin({
      userId: target,
      amount: 3,
      adminId: target, // token_ledger.created_by → the target, too
      idempotencyKey: adminGrantIdempotencyKey(target, crypto.randomUUID()),
      note: null,
    });
    assert.equal(granted.status, "granted");
    assert.equal((await tokenRepository.consumeForMemoryPdfUnlock({ userId: target, memoryProjectId: unlockedProject })).status, "newly_unlocked");
    // A Shopier purchase (lot + its credit, recorded by `other` as the admin) after that
    // consume, so the unlock's allocation stays on the grant, and a pending refund of it
    // opened by the target — token_purchase_lots.user_id, token_refunds.user_id/created_by.
    const orderRef = `T-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const purchase = await tokenRepository.creditShopierPurchase({
      userId: target, adminId: other, packageId: "tokens-10", orderRef, buyerEmail: `${target}@example.test`,
    });
    assert.equal(purchase.status, "credited");
    const [{ id: lotId }] = await sql<{ id: string }[]>`
      select id from token_purchase_lots where provider = 'shopier' and external_order_reference = ${orderRef}`;
    const refundId = uid("refund");
    await sql`
      insert into token_refunds (id, user_id, purchase_lot_id, status, refund_amount_kurus, tokens_reversed, idempotency_key, created_by)
      values (${refundId}, ${target}, ${lotId}, 'pending_external_refund', 100, 1, ${`test-refund:${crypto.randomUUID()}`}, ${target})`;
    const codedProject = await createProject(target, othersMessage);
    const codeId = uid("code");
    await sql`insert into digital_access_codes (id, memory_project_id, code, status, redeemed_at, redeemed_by)
      values (${codeId}, ${codedProject}, ${uid("CODE")}, 'redeemed', now(), ${target})`;

    // Blocks both ways (deleted) and between two other people (kept).
    await sql`insert into user_blocks (blocker_user_id, blocked_user_id) values (${target}, ${other}), (${other}, ${target}), (${other}, ${third})`;

    // Apple tokens for both clients and two mobile sessions (all deleted); another person's session (kept).
    await sql`insert into apple_sign_in_tokens (user_id, client, encrypted_refresh_token)
      values (${target}, 'web', 'ciphertext-web'), (${target}, 'ios', 'ciphertext-ios')`;
    const expires = new Date(Date.now() + 86_400_000).toISOString();
    await sql`insert into mobile_sessions (id, user_id, refresh_token_hash, platform, expires_at)
      values (${uid("ms")}, ${target}, ${uid("h")}, 'ios', ${expires}), (${uid("ms")}, ${target}, ${uid("h")}, 'android', ${expires})`;
    const othersSession = uid("ms");
    await sql`insert into mobile_sessions (id, user_id, refresh_token_hash, platform, expires_at)
      values (${othersSession}, ${other}, ${uid("h")}, 'ios', ${expires})`;

    return {
      target, other, third, othersMessage, published, unpublished, rejectedReported, pendingNotified, othersLike,
      filedReport, reviewedReport, othersNotification, draftProject, orderedProject, orderId, unlockedProject,
      codedProject, codeId, othersSession, lotId, refundId,
    };
  }

  const count = async (query: ReturnType<typeof sql>) => ((await query) as unknown as { n: number }[])[0].n;

  it("the fixture puts a row behind every foreign key to users.id", async () => {
    const { target } = await seedAccount();
    const missing = Object.entries(await referencesTo(target)).filter(([, n]) => n === 0).map(([fk]) => fk);
    assert.deepEqual(missing, [], "extend seedAccount for a new foreign key to users.id (and check deleteAccount handles it)");
    assert.equal((await userForeignKeys()).length, 24);
  });

  it("deletes or re-points every reference, removing the account and leaving other people's rows alone", async () => {
    const f = await seedAccount();
    assert.deepEqual(await userRepository.deleteAccount(f.target), { status: "deleted" });

    // No foreign key references the account anymore, and its row is gone.
    assert.deepEqual(Object.entries(await referencesTo(f.target)).filter(([, n]) => n > 0), []);
    assert.equal(await count(sql`select count(*)::int as n from users where id = ${f.target}`), 0);

    // Exactly one tombstone, with no personal data.
    const [{ author_id: tombstone }] = await sql<{ author_id: string }[]>`select author_id from messages where id = ${f.published}`;
    const [stone] = await sql<{ email: string; name: string | null; image: string | null; public_id: string | null; deleted: boolean; role: string }[]>`
      select email, name, image, public_id, deleted_at is not null as deleted, role::text as role from users where id = ${tombstone}`;
    assert.ok(tombstone.startsWith("deleted_"));
    assert.deepEqual(
      { ...stone, email: stone.email.endsWith("@deleted.invalid") },
      { email: true, name: null, image: null, public_id: null, deleted: true, role: "user" }
    );

    // Deleted: Apple tokens (both clients), mobile sessions, own notifications, blocks, own like,
    // the unreferenced unpublished message, the bare draft project.
    assert.equal(await count(sql`select count(*)::int as n from apple_sign_in_tokens where user_id in (${f.target}, ${tombstone})`), 0);
    assert.equal(await count(sql`select count(*)::int as n from mobile_sessions where user_id in (${f.target}, ${tombstone})`), 0);
    assert.equal(await count(sql`select count(*)::int as n from notifications where recipient_user_id = ${tombstone}`), 0);
    assert.equal(await count(sql`select count(*)::int as n from user_blocks where ${tombstone} in (blocker_user_id, blocked_user_id)`), 0);
    assert.equal(await count(sql`select count(*)::int as n from message_likes where user_id = ${tombstone}`), 0);
    assert.equal(await count(sql`select count(*)::int as n from messages where id = ${f.unpublished}`), 0);
    assert.equal(await count(sql`select count(*)::int as n from memory_projects where id = ${f.draftProject}`), 0);

    // The like count of the message the account had liked went down by one.
    const [liked] = await sql<{ like_count: number }[]>`select like_count from messages where id = ${f.othersMessage}`;
    assert.equal(liked.like_count, 0);

    // Anonymized onto the tombstone: published, reported and notified messages; pending edits dropped.
    const kept = await sql<{ id: string; author_id: string; author_name: string; is_anonymous: boolean; show_on_personal_wall: boolean;
      pending_content: string | null; revision_submitted_at: Date | null; revision_rejection_reason: string | null; like_count: number }[]>`
      select id, author_id, author_name, is_anonymous, show_on_personal_wall, pending_content, revision_submitted_at,
        revision_rejection_reason, like_count
      from messages where id in (${f.published}, ${f.rejectedReported}, ${f.pendingNotified}) order by id`;
    assert.equal(kept.length, 3);
    for (const m of kept) {
      assert.deepEqual(
        { author: m.author_id, name: m.author_name, anon: m.is_anonymous, wall: m.show_on_personal_wall, edit: m.pending_content,
          submitted: m.revision_submitted_at, reason: m.revision_rejection_reason },
        { author: tombstone, name: "anonymous", anon: true, wall: false, edit: null, submitted: null, reason: null },
        m.id
      );
    }
    assert.equal(kept.find((m) => m.id === f.published)!.like_count, 1, "someone else's like on it stays counted");

    // Re-pointed: projects with an order/unlock/code, the order, the code, the unlock, wallet, ledger, reports, audit columns.
    const projects = await sql<{ id: string; created_by: string }[]>`
      select id, created_by from memory_projects where id in (${f.orderedProject}, ${f.unlockedProject}, ${f.codedProject})`;
    assert.deepEqual(projects.map((p) => p.created_by), [tombstone, tombstone, tombstone]);
    assert.equal(await count(sql`select count(*)::int as n from physical_orders where id = ${f.orderId} and created_by = ${tombstone}`), 1);
    assert.equal(await count(sql`select count(*)::int as n from digital_access_codes where id = ${f.codeId} and redeemed_by = ${tombstone}`), 1);
    assert.equal(await count(sql`select count(*)::int as n from memory_pdf_unlocks where memory_project_id = ${f.unlockedProject} and user_id = ${tombstone}`), 1);
    const [tokens] = await sql<{ balance: number; total: number; entries: number; created: number }[]>`
      select (select balance from token_wallets where user_id = ${tombstone}) as balance,
        (select coalesce(sum(amount), 0)::int from token_ledger where user_id = ${tombstone}) as total,
        (select count(*)::int from token_ledger where user_id = ${tombstone}) as entries,
        (select count(*)::int from token_ledger where created_by = ${tombstone}) as created`;
    // Grant 3 − unlock 1 + Shopier tokens-10 purchase 10; only the grant was created by the target.
    assert.deepEqual(tokens, { balance: 12, total: 12, entries: 3, created: 1 }, "balance == SUM(ledger) stays with the tombstone");
    assert.equal(await count(sql`select count(*)::int as n from token_purchase_lots where id = ${f.lotId} and user_id = ${tombstone}`), 1);
    assert.equal(await count(sql`select count(*)::int as n from token_refunds
      where id = ${f.refundId} and user_id = ${tombstone} and created_by = ${tombstone}`), 1);
    assert.equal(await count(sql`select count(*)::int as n from message_reports where id = ${f.filedReport} and reporter_id = ${tombstone}`), 1);
    assert.equal(await count(sql`select count(*)::int as n from message_reports where id = ${f.reviewedReport} and reviewed_by = ${tombstone}`), 1);
    assert.equal(await count(sql`select count(*)::int as n from messages
      where id = ${f.othersMessage} and moderated_by = ${tombstone} and revision_reviewed_by = ${tombstone}`), 1);
    assert.equal(await count(sql`select count(*)::int as n from invitations where created_by = ${tombstone}`), 1);
    assert.equal(await count(sql`select count(*)::int as n from users where id = ${f.other} and status_changed_by = ${tombstone}`), 1);

    // Other people's rows are untouched.
    assert.equal(await count(sql`select count(*)::int as n from mobile_sessions where id = ${f.othersSession}`), 1);
    assert.equal(await count(sql`select count(*)::int as n from user_blocks where blocker_user_id = ${f.other} and blocked_user_id = ${f.third}`), 1);
    assert.equal(await count(sql`select count(*)::int as n from message_likes where id = ${f.othersLike}`), 1);
    assert.equal(await count(sql`select count(*)::int as n from notifications where id = ${f.othersNotification}`), 1);
    assert.equal(await userRepository.isActiveAccount(f.other), true);
  });

  it("leaves the whole database unchanged when the deletion fails at its very last step", async () => {
    const { target } = await seedAccount();
    // A test-only stand-in for a failure at the end: the final DELETE of the user row raises,
    // after every other step of the transaction has already run.
    await sql.unsafe(`
      create function test_fail_user_delete() returns trigger language plpgsql as $$
      begin raise exception 'test: user delete refused'; end; $$`);
    await sql.unsafe(`
      create trigger users_zzz_test_fail before delete on users for each row
      when (old.id = '${target}') execute function test_fail_user_delete()`);
    try {
      const before = await databaseFingerprint();
      await assert.rejects(userRepository.deleteAccount(target), (error: unknown) =>
        /test: user delete refused/.test(`${error} ${(error as { cause?: unknown }).cause}`)
      );
      assert.deepEqual(await databaseFingerprint(), before, "no table changed — no tombstone, no deleted or re-pointed row");
    } finally {
      await sql.unsafe(`drop trigger users_zzz_test_fail on users`);
      await sql.unsafe(`drop function test_fail_user_delete()`);
    }
    assert.deepEqual(await userRepository.deleteAccount(target), { status: "deleted" }, "deletion works once the failure is gone");
  });

  it("refuses an admin account and an unknown id without changing anything", async () => {
    const admin = await createUser(undefined, "admin");
    await sql`insert into mobile_sessions (id, user_id, refresh_token_hash, platform, expires_at)
      values (${uid("ms")}, ${admin}, ${uid("h")}, 'ios', ${new Date(Date.now() + 86_400_000).toISOString()})`;
    const before = await databaseFingerprint();
    assert.deepEqual(await userRepository.deleteAccount(admin), { status: "admin-account" });
    assert.deepEqual(await userRepository.deleteAccount(uid("missing")), { status: "not-found" });
    assert.deepEqual(await databaseFingerprint(), before);
  });

  it("serializes two concurrent deletions of the same account: one deletes, the other finds nothing", async () => {
    const { target } = await seedAccount();
    const results = await Promise.all([userRepository.deleteAccount(target), userRepository.deleteAccount(target)]);
    assert.deepEqual(results.map((r) => r.status).sort(), ["deleted", "not-found"]);
    assert.equal(await count(sql`select count(*)::int as n from users where id = ${target}`), 0);
    assert.deepEqual(Object.entries(await referencesTo(target)).filter(([, n]) => n > 0), []);
  });

  describe("with the Apple revocation (a fake — no request to Apple)", () => {
    const appleId = () => `apple:${crypto.randomUUID()}`;

    it("deletes nothing when the revocation fails", async () => {
      const { target } = await seedAccount(appleId());
      const before = await databaseFingerprint();
      const calls: string[] = [];
      const result = await deleteUserAccount(target, {
        revokeApple: async (id): Promise<AppleRevokeOutcome> => (calls.push(id), "failed"),
      });
      assert.deepEqual(result, { status: "apple-revoke-failed" });
      assert.deepEqual(calls, [target]);
      assert.deepEqual(await databaseFingerprint(), before);
    });

    it("deletes nothing when the revocation throws", async () => {
      const { target } = await seedAccount(appleId());
      const before = await databaseFingerprint();
      await assert.rejects(
        deleteUserAccount(target, {
          revokeApple: async () => {
            throw new Error("test: network");
          },
        }),
        /test: network/
      );
      assert.deepEqual(await databaseFingerprint(), before);
    });

    it("revokes while the account and its Apple tokens still exist, then deletes them", async () => {
      const { target } = await seedAccount(appleId());
      let seenAtRevoke: { user: number; tokens: number } | null = null;
      const result = await deleteUserAccount(target, {
        revokeApple: async (id): Promise<AppleRevokeOutcome> => {
          seenAtRevoke = {
            user: await count(sql`select count(*)::int as n from users where id = ${id}`),
            tokens: await count(sql`select count(*)::int as n from apple_sign_in_tokens where user_id = ${id}`),
          };
          return "revoked";
        },
      });
      assert.deepEqual(result, { status: "deleted" });
      assert.deepEqual(seenAtRevoke, { user: 1, tokens: 2 }, "revocation runs before the database transaction");
      assert.equal(await count(sql`select count(*)::int as n from apple_sign_in_tokens where user_id = ${target}`), 0);
      assert.deepEqual(Object.entries(await referencesTo(target)).filter(([, n]) => n > 0), []);
    });
  });

  describe("deleteOwnAccountForUser with the real repository (Google account, no Apple step)", () => {
    it("changes nothing on a wrong confirmation email", async () => {
      const { target } = await seedAccount();
      const before = await databaseFingerprint();
      assert.deepEqual(await deleteOwnAccountForUser({ userId: target, confirmationEmail: "someone-else@example.test" }), {
        ok: false,
        error: "confirmation-mismatch",
      });
      assert.deepEqual(await databaseFingerprint(), before);
    });

    it("deletes the account, its mobile sessions and Apple token rows on the right email", async () => {
      const { target } = await seedAccount();
      assert.deepEqual(await deleteOwnAccountForUser({ userId: target, confirmationEmail: ` ${target.toUpperCase()}@EXAMPLE.TEST ` }), { ok: true });
      assert.equal(await count(sql`select count(*)::int as n from users where id = ${target}`), 0);
      assert.equal(await count(sql`select count(*)::int as n from mobile_sessions where user_id = ${target}`), 0);
      assert.equal(await count(sql`select count(*)::int as n from apple_sign_in_tokens where user_id = ${target}`), 0);
    });
  });
});
