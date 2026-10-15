import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, beforeEach, describe, it, mock } from "node:test";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { userRepository } from "@/features/users/repository";
import { loadTokenHistory, type TokenHistoryDeps, type TokenHistoryResult, type TokenHistoryRow } from "./history";
import type { LedgerCursor } from "./lib/ledgerCursor";
import { MAX_LEDGER_PAGE_SIZE, adminGrantIdempotencyKey, tokenRepository, type LedgerPage } from "./repository";

// Real PostgreSQL behaviour of tokenRepository: row locks, conditional
// decrement, unique-violation fallbacks. Run through `npm run test:db:tokens`,
// which starts a throwaway Docker container and passes its URL in
// TOKEN_TEST_DATABASE_URL. Skipped entirely without one, and refuses any
// URL that isn't the local throwaway test database.

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

// getDb()'s shared client serves every suite in this file — close it only once they've all run.
after(async () => {
  await (globalThis as { mindotSql?: ReturnType<typeof postgres> }).mindotSql?.end({ timeout: 5 });
});

describe("tokenRepository on PostgreSQL", { skip: TEST_URL ? false : "TOKEN_TEST_DATABASE_URL is not set" }, () => {
  let sql: ReturnType<typeof postgres>;
  let adminId: string;

  before(async () => {
    // getDb() reads DATABASE_URL lazily, on the first query — point it at the test database only.
    delete process.env.APP_ENV;
    process.env.DATABASE_URL = TEST_URL!;
    sql = postgres(TEST_URL!, { max: 2, onnotice: () => {} });
    await migrate(drizzle(sql), { migrationsFolder: "drizzle" });
    adminId = await createUser("admin");
  });

  after(async () => {
    await sql?.end({ timeout: 5 });
  });

  async function createUser(role: "user" | "admin" = "user"): Promise<string> {
    const id = `test-${crypto.randomUUID()}`;
    await sql`insert into users (id, email, role) values (${id}, ${`${id}@example.test`}, ${role})`;
    return id;
  }

  async function createProject(ownerId: string): Promise<string> {
    const messageId = `msg-${crypto.randomUUID()}`;
    const projectId = `proj-${crypto.randomUUID()}`;
    await sql`
      insert into messages (id, content, author_id, author_name, language, template_id, status)
      values (${messageId}, 'test', ${ownerId}, 'anonymous', 'en', 'standard-classic', 'approved')`;
    await sql`
      insert into memory_projects (id, message_id, created_by, capture_mode, output_type)
      values (${projectId}, ${messageId}, ${ownerId}, 'note_only', 'personal_pdf')`;
    return projectId;
  }

  async function grant(userId: string, amount: number) {
    const result = await tokenRepository.grantByAdmin({
      userId,
      amount,
      adminId,
      idempotencyKey: adminGrantIdempotencyKey(adminId, crypto.randomUUID()),
      note: null,
    });
    assert.equal(result.status, "granted");
  }

  async function ledgerRows(userId: string) {
    return sql<{ amount: number; type: string; balance_after: number }[]>`
      select amount, type::text as type, balance_after from token_ledger where user_id = ${userId} order by created_at, id`;
  }

  async function unlockCount(projectId: string): Promise<number> {
    const [row] = await sql<{ n: number }[]>`select count(*)::int as n from memory_pdf_unlocks where memory_project_id = ${projectId}`;
    return row.n;
  }

  /**
   * balance == SUM(ledger.amount), and some entry's balance_after is the balance. Not "the newest
   * by created_at": created_at is the transaction's start time, not the order the wallet lock
   * serialized the writes in, so concurrent entries can carry out-of-order timestamps.
   */
  async function assertConsistent(userId: string, expectedBalance: number) {
    const [row] = await sql<{ balance: number | null; total: number; entries: number; matching: number }[]>`
      select
        (select balance from token_wallets where user_id = ${userId}) as balance,
        (select coalesce(sum(amount), 0)::int from token_ledger where user_id = ${userId}) as total,
        (select count(*)::int from token_ledger where user_id = ${userId}) as entries,
        (select count(*)::int from token_ledger t where t.user_id = ${userId}
          and t.balance_after = (select balance from token_wallets where user_id = ${userId})) as matching`;
    const balance = row.balance ?? 0;
    assert.equal(balance, expectedBalance, "wallet balance");
    assert.equal(row.total, balance, "SUM(ledger.amount) == wallet balance");
    if (row.entries > 0) assert.ok(row.matching > 0, "an entry's balance_after == wallet balance");
    assert.equal(await tokenRepository.getBalance(userId), expectedBalance, "getBalance");
  }

  let userId: string;
  beforeEach(async () => {
    userId = await createUser();
  });

  describe("PDF unlock", () => {
    it("unlocks with enough balance: one token off, one consume entry, one unlock row", async () => {
      await grant(userId, 2);
      const projectId = await createProject(userId);

      const result = await tokenRepository.consumeForMemoryPdfUnlock({ userId, memoryProjectId: projectId });

      assert.equal(result.status, "newly_unlocked");
      assert.equal(result.status === "newly_unlocked" && result.balance, 1);
      assert.deepEqual(
        (await ledgerRows(userId)).map((row) => [row.type, row.amount, row.balance_after]),
        [["grant", 2, 2], ["consume", -1, 1]]
      );
      assert.equal(await unlockCount(projectId), 1);
      const allocations = await sql<{ source_type: string; amount: number; purchase_lot_id: string | null }[]>
        `select source_type, amount, purchase_lot_id from token_purchase_allocations where user_id = ${userId}`;
      assert.deepEqual([...allocations], [{ source_type: "other", amount: 1, purchase_lot_id: null }]);
      await assertConsistent(userId, 1);
    });

    it("allocates a PDF unlock to its exact Shopier purchase lot", async () => {
      const orderRef = `T-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      const purchase = await tokenRepository.creditShopierPurchase({
        userId, adminId, packageId: "tokens-10", orderRef, buyerEmail: `${userId}@example.test`,
      });
      assert.equal(purchase.status, "credited");
      const projectId = await createProject(userId);
      const result = await tokenRepository.consumeForMemoryPdfUnlock({ userId, memoryProjectId: projectId });
      assert.equal(result.status, "newly_unlocked");
      const rows = await sql<{ source_type: string; amount: number; purchase_lot_id: string | null; source_ledger_entry_id: string }[]>
        `select a.source_type, a.amount, a.purchase_lot_id, a.source_ledger_entry_id
         from token_purchase_allocations a
         join token_purchase_lots l on l.id = a.purchase_lot_id
         where a.user_id = ${userId} and l.external_order_reference = ${orderRef}`;
      assert.equal(rows.length, 1);
      assert.equal(rows[0].source_type, "purchase");
      assert.equal(rows[0].amount, 1);
      assert.equal(rows[0].source_ledger_entry_id, purchase.status === "credited" ? purchase.entry.id : "");
      await assertConsistent(userId, 9);
    });

    it("refuses an unlock without balance and changes neither the balance nor the ledger", async () => {
      const projectId = await createProject(userId);

      const result = await tokenRepository.consumeForMemoryPdfUnlock({ userId, memoryProjectId: projectId });

      assert.deepEqual(result, { status: "insufficient_tokens", balance: 0 });
      assert.equal((await ledgerRows(userId)).length, 0);
      assert.equal(await unlockCount(projectId), 0);
      await assertConsistent(userId, 0);
    });

    it("refuses once the balance runs out, leaving earlier entries untouched", async () => {
      await grant(userId, 1);
      const first = await createProject(userId);
      const second = await createProject(userId);
      assert.equal((await tokenRepository.consumeForMemoryPdfUnlock({ userId, memoryProjectId: first })).status, "newly_unlocked");

      const result = await tokenRepository.consumeForMemoryPdfUnlock({ userId, memoryProjectId: second });

      assert.deepEqual(result, { status: "insufficient_tokens", balance: 0 });
      assert.equal((await ledgerRows(userId)).length, 2);
      assert.equal(await unlockCount(second), 0);
      await assertConsistent(userId, 0);
    });

    it("never charges a repeated unlock of the same project", async () => {
      await grant(userId, 3);
      const projectId = await createProject(userId);
      const first = await tokenRepository.consumeForMemoryPdfUnlock({ userId, memoryProjectId: projectId });

      const second = await tokenRepository.consumeForMemoryPdfUnlock({ userId, memoryProjectId: projectId });

      assert.equal(first.status, "newly_unlocked");
      assert.equal(second.status, "already_unlocked");
      assert.equal(second.status === "already_unlocked" && second.unlock.id, first.status === "newly_unlocked" && first.unlock.id);
      assert.equal((await ledgerRows(userId)).filter((row) => row.type === "consume").length, 1);
      await assertConsistent(userId, 2);
    });

    it("charges exactly one token for 10 concurrent unlocks of the same project", async () => {
      await grant(userId, 5);
      const projectId = await createProject(userId);

      const results = await Promise.all(
        Array.from({ length: 10 }, () => tokenRepository.consumeForMemoryPdfUnlock({ userId, memoryProjectId: projectId }))
      );

      const statuses = results.map((result) => result.status);
      assert.equal(statuses.filter((status) => status === "newly_unlocked").length, 1, statuses.join(","));
      assert.equal(statuses.filter((status) => status === "already_unlocked").length, 9, statuses.join(","));
      assert.equal(await unlockCount(projectId), 1);
      assert.equal((await ledgerRows(userId)).filter((row) => row.type === "consume").length, 1);
      await assertConsistent(userId, 4);
    });

    it("never overdraws when concurrent unlocks of different projects exceed the balance", async () => {
      await grant(userId, 3);
      const projects = await Promise.all(Array.from({ length: 6 }, () => createProject(userId)));

      const results = await Promise.all(
        projects.map((memoryProjectId) => tokenRepository.consumeForMemoryPdfUnlock({ userId, memoryProjectId }))
      );

      const statuses = results.map((result) => result.status);
      assert.equal(statuses.filter((status) => status === "newly_unlocked").length, 3, statuses.join(","));
      assert.equal(statuses.filter((status) => status === "insufficient_tokens").length, 3, statuses.join(","));
      // Serialized by the wallet lock: each consume saw the previous one's balance.
      const consumes = (await ledgerRows(userId)).filter((row) => row.type === "consume");
      assert.deepEqual(consumes.map((row) => row.balance_after).sort(), [0, 1, 2]);
      await assertConsistent(userId, 0);
    });
  });

  describe("admin grant", () => {
    it("credits a repeated requestId only once", async () => {
      const key = adminGrantIdempotencyKey(adminId, crypto.randomUUID());
      const input = { userId, amount: 5, adminId, idempotencyKey: key, note: "test" };

      const first = await tokenRepository.grantByAdmin(input);
      const second = await tokenRepository.grantByAdmin(input);

      assert.equal(first.status, "granted");
      assert.equal(second.status, "already_granted");
      assert.equal(second.status === "already_granted" && second.entry.id, first.status === "granted" && first.entry.id);
      assert.equal((await ledgerRows(userId)).length, 1);
      await assertConsistent(userId, 5);
    });

    it("credits 10 concurrent submits of the same requestId only once", async () => {
      const key = adminGrantIdempotencyKey(adminId, crypto.randomUUID());
      const input = { userId, amount: 7, adminId, idempotencyKey: key, note: null };

      const results = await Promise.all(Array.from({ length: 10 }, () => tokenRepository.grantByAdmin(input)));

      const statuses = results.map((result) => result.status);
      assert.equal(statuses.filter((status) => status === "granted").length, 1, statuses.join(","));
      assert.equal(statuses.filter((status) => status === "already_granted").length, 9, statuses.join(","));
      await assertConsistent(userId, 7);
    });

    it("records the admin, the note and the resulting balance on the grant entry", async () => {
      const result = await tokenRepository.grantByAdmin({
        userId,
        amount: 4,
        adminId,
        idempotencyKey: adminGrantIdempotencyKey(adminId, crypto.randomUUID()),
        note: "audit note",
      });

      assert.equal(result.status, "granted");
      if (result.status !== "granted") return;
      assert.equal(result.entry.type, "grant");
      assert.equal(result.entry.createdBy, adminId);
      assert.equal(result.entry.userId, userId);
      assert.equal(result.entry.amount, 4);
      assert.equal(result.entry.balanceAfter, 4);
      assert.equal(result.entry.note, "audit note");
      assert.equal(result.entry.referenceType, "admin_grant");
    });

    it("never writes the recipient's user id into reference_id, so nothing outlives an account deletion", async () => {
      const recipient = await createUser();
      const result = await tokenRepository.grantByAdmin({
        userId: recipient,
        amount: 2,
        adminId,
        idempotencyKey: adminGrantIdempotencyKey(adminId, crypto.randomUUID()),
        note: null,
      });
      assert.equal(result.status, "granted");
      if (result.status !== "granted") return;
      assert.equal(result.entry.referenceId, null);

      assert.deepEqual(await userRepository.deleteAccount(recipient), { status: "deleted" });
      const [row] = await sql<{ user_id: string; reference_id: string | null; idempotency_key: string }[]>`
        select user_id, reference_id, idempotency_key from token_ledger where id = ${result.entry.id}`;
      assert.match(row.user_id, /^deleted_/);
      assert.equal(row.reference_id, null);
      const [leftover] = await sql<{ n: number }[]>`
        select count(*)::int as n from token_ledger
        where reference_id = ${recipient} or idempotency_key like ${`%${recipient}%`} or note like ${`%${recipient}%`}`;
      assert.equal(leftover.n, 0, "the deleted account's id is still in the ledger");
    });

    it("returns conflict, crediting nothing, when a key is reused with a different amount", async () => {
      const key = adminGrantIdempotencyKey(adminId, crypto.randomUUID());
      await tokenRepository.grantByAdmin({ userId, amount: 5, adminId, idempotencyKey: key, note: null });

      const result = await tokenRepository.grantByAdmin({ userId, amount: 6, adminId, idempotencyKey: key, note: null });

      assert.deepEqual(result, { status: "conflict" });
      await assertConsistent(userId, 5);
    });

    it("returns conflict, crediting nothing, when a key is reused for a different recipient", async () => {
      const other = await createUser();
      const key = adminGrantIdempotencyKey(adminId, crypto.randomUUID());
      await tokenRepository.grantByAdmin({ userId, amount: 5, adminId, idempotencyKey: key, note: null });

      const result = await tokenRepository.grantByAdmin({ userId: other, amount: 5, adminId, idempotencyKey: key, note: null });

      assert.deepEqual(result, { status: "conflict" });
      await assertConsistent(userId, 5);
      await assertConsistent(other, 0);
    });
  });

  describe("Shopier purchase", () => {
    function newOrderRef(): string {
      return `T-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    }

    function emailOf(id: string): string {
      return `${id}@example.test`; // createUser's address
    }

    function purchase(overrides: Partial<Parameters<typeof tokenRepository.creditShopierPurchase>[0]> = {}) {
      return tokenRepository.creditShopierPurchase({
        userId,
        adminId,
        packageId: "tokens-50",
        orderRef: newOrderRef(),
        buyerEmail: emailOf(userId),
        ...overrides,
      });
    }

    async function orderRows(orderRef: string) {
      return sql<
        {
          id: string;
          user_id: string;
          amount: number;
          type: string;
          balance_after: number;
          reference_type: string | null;
          reference_id: string | null;
          idempotency_key: string;
          external_provider: string | null;
          external_reference: string | null;
          created_by: string | null;
          note: string | null;
        }[]
      >`
        select id, user_id, amount, type::text as type, balance_after, reference_type, reference_id, idempotency_key,
          external_provider, external_reference, created_by, note
        from token_ledger where external_reference = ${orderRef} order by created_at, id`;
    }

    async function walletExists(id: string): Promise<boolean> {
      const [row] = await sql<{ n: number }[]>`select count(*)::int as n from token_wallets where user_id = ${id}`;
      return row.n === 1;
    }

    it("credits the package's amount with a purchase entry naming the order, the package and the admin", async () => {
      const orderRef = newOrderRef();
      const result = await purchase({ orderRef: `  ${orderRef.toLowerCase()} ` });

      assert.equal(result.status, "credited");
      if (result.status !== "credited") return;
      assert.equal(result.emailCheck, "matched");
      assert.equal(result.balance, 50);
      const rows = await orderRows(orderRef);
      assert.equal(rows.length, 1);
      assert.deepEqual(
        { ...rows[0], id: undefined },
        {
          id: undefined,
          user_id: userId,
          amount: 50,
          type: "purchase",
          balance_after: 50,
          reference_type: "shopier_order",
          reference_id: "tokens-50",
          idempotency_key: `shopier_order:${orderRef}`,
          external_provider: "shopier",
          external_reference: orderRef,
          created_by: adminId,
          note: "email: matched",
        }
      );
      assert.equal(result.entry.id, rows[0].id);
      const lots = await sql<{ id: string; user_id: string; external_order_reference: string; package_id: string; package_tokens: number; paid_amount_kurus: number; credited_ledger_entry_id: string }[]>
        `select id, user_id, external_order_reference, package_id, package_tokens, paid_amount_kurus, credited_ledger_entry_id
        from token_purchase_lots where provider = 'shopier' and external_order_reference = ${orderRef}`;
      assert.equal(lots.length, 1);
      assert.deepEqual({ ...lots[0], id: undefined }, {
        id: undefined, user_id: userId, external_order_reference: orderRef,
        package_id: "tokens-50", package_tokens: 50, paid_amount_kurus: 5000,
        credited_ledger_entry_id: rows[0].id,
      });
      await assertConsistent(userId, 50);
    });

    it("takes every amount from its package", async () => {
      let total = 0;
      for (const [packageId, tokens] of [["tokens-10", 10], ["tokens-50", 50], ["tokens-100", 100]] as const) {
        const result = await purchase({ packageId });
        assert.equal(result.status, "credited", packageId);
        total += tokens;
        assert.equal(result.status === "credited" && result.entry.amount, tokens, packageId);
      }
      await assertConsistent(userId, total);
    });

    it("records a repeated order for the same account and package only once", async () => {
      const orderRef = newOrderRef();
      const first = await purchase({ orderRef });
      const second = await purchase({ orderRef: ` ${orderRef.toLowerCase()}` });

      assert.equal(first.status, "credited");
      assert.equal(second.status, "already_recorded");
      assert.equal(second.status === "already_recorded" && second.entry.id, first.status === "credited" && first.entry.id);
      assert.equal(second.status === "already_recorded" && second.balance, 50);
      assert.equal((await orderRows(orderRef)).length, 1);
      const lots = await sql<{ n: number }[]>
        `select count(*)::int as n from token_purchase_lots
        where provider = 'shopier' and external_order_reference = ${orderRef}`;
      assert.equal(lots[0].n, 1, "repeated purchase must not create another purchase lot");
      await assertConsistent(userId, 50);
    });

    it("credits 10 concurrent submits of the same order only once", async () => {
      const orderRef = newOrderRef();
      const results = await Promise.all(Array.from({ length: 10 }, () => purchase({ orderRef })));

      const statuses = results.map((result) => result.status);
      assert.equal(statuses.filter((status) => status === "credited").length, 1, statuses.join(","));
      assert.equal(statuses.filter((status) => status === "already_recorded").length, 9, statuses.join(","));
      assert.equal((await orderRows(orderRef)).length, 1);
      await assertConsistent(userId, 50);
    });

    it("refuses an order already credited to another account, writing nothing for that account", async () => {
      const orderRef = newOrderRef();
      const first = await purchase({ orderRef });
      assert.equal(first.status, "credited");
      const other = await createUser();

      const second = await purchase({ userId: other, orderRef, buyerEmail: emailOf(other) });

      assert.equal(second.status, "order_already_used");
      if (second.status !== "order_already_used") return;
      assert.equal(second.existing.userId, userId);
      assert.equal(second.existing.packageId, "tokens-50");
      assert.equal(second.existing.amount, 50);
      assert.equal(second.existing.createdBy, adminId);
      assert.equal(second.existing.entryId, first.status === "credited" && first.entry.id);
      assert.equal(await walletExists(other), false, "no wallet row for the refused account");
      assert.equal((await ledgerRows(other)).length, 0);
      await assertConsistent(userId, 50);
    });

    it("refuses the same order for another package of the same account", async () => {
      const orderRef = newOrderRef();
      assert.equal((await purchase({ orderRef })).status, "credited");

      const second = await purchase({ orderRef, packageId: "tokens-100" });

      assert.equal(second.status, "order_already_used");
      assert.equal((await orderRows(orderRef)).length, 1);
      await assertConsistent(userId, 50);
    });

    it("reports a reused order as such even when the email no longer matches", async () => {
      const orderRef = newOrderRef();
      assert.equal((await purchase({ orderRef })).status, "credited");
      const other = await createUser();

      const second = await purchase({ userId: other, orderRef, buyerEmail: "someone-else@example.test" });

      assert.equal(second.status, "order_already_used");
      assert.equal(await walletExists(other), false);
    });

    it("credits exactly one of two accounts racing for the same order", async () => {
      const orderRef = newOrderRef();
      const other = await createUser();

      const results = await Promise.all([
        purchase({ orderRef }),
        purchase({ userId: other, orderRef, buyerEmail: emailOf(other) }),
      ]);

      assert.deepEqual(results.map((result) => result.status).sort(), ["credited", "order_already_used"]);
      assert.equal((await orderRows(orderRef)).length, 1);
      const winner = results[0].status === "credited" ? userId : other;
      const loser = winner === userId ? other : userId;
      await assertConsistent(winner, 50);
      await assertConsistent(loser, 0);
    });

    it("writes nothing on an email mismatch without a manual-review reason", async () => {
      const orderRef = newOrderRef();
      for (const manualReviewReason of [undefined, null, "", "   "]) {
        const result = await purchase({ orderRef, buyerEmail: "someone-else@example.test", manualReviewReason });
        assert.deepEqual(result, { status: "email_mismatch" }, JSON.stringify(manualReviewReason));
      }
      assert.equal(await walletExists(userId), false);
      assert.equal((await ledgerRows(userId)).length, 0);
      assert.equal((await orderRows(orderRef)).length, 0);
    });

    it("credits a mismatch only with a reason, and never stores the buyer's email", async () => {
      const orderRef = newOrderRef();
      const buyer = "Someone-Else@Example.test";

      const result = await purchase({
        orderRef,
        buyerEmail: buyer,
        manualReviewReason: "Confirmed with someone-else@example.test by phone",
        note: `Paid from ${buyer}`,
      });

      assert.equal(result.status, "credited");
      assert.equal(result.status === "credited" && result.emailCheck, "manual_review");
      const [row] = await orderRows(orderRef);
      assert.equal(row.note, "email: manual review — Confirmed with [e-posta] by phone | Paid from [e-posta]");
      const [leaks] = await sql<{ n: number }[]>`
        select count(*)::int as n from token_ledger t
        where lower(row_to_json(t)::text) like ${"%someone-else@example.test%"}`;
      assert.equal(leaks.n, 0, "the buyer's email reached the ledger");
      await assertConsistent(userId, 50);
    });

    it("matches the account email regardless of case and surrounding spaces", async () => {
      const result = await purchase({ buyerEmail: `  ${emailOf(userId).toUpperCase()} ` });
      assert.equal(result.status === "credited" && result.emailCheck, "matched");
    });

    it("refuses a tombstone and an unknown account, writing nothing", async () => {
      const tombstone = `deleted_${crypto.randomUUID()}`;
      await sql`insert into users (id, email, role, deleted_at) values (${tombstone}, ${`${tombstone}@deleted.invalid`}, 'user', now())`;
      const unknown = `missing-${crypto.randomUUID()}`;

      for (const id of [tombstone, unknown]) {
        const orderRef = newOrderRef();
        assert.deepEqual(await purchase({ userId: id, orderRef, buyerEmail: emailOf(id) }), { status: "ineligible" }, id);
        assert.equal(await walletExists(id), false, `wallet for ${id}`);
        assert.equal((await orderRows(orderRef)).length, 0);
      }
    });

    it("still credits a suspended account — the order was paid", async () => {
      await sql`update users set status = 'suspended' where id = ${userId}`;
      assert.equal((await purchase()).status, "credited");
      await assertConsistent(userId, 50);
    });

    it("keeps a deleted account's order used: its tombstone holds it, and no new account can reuse it", async () => {
      const orderRef = newOrderRef();
      assert.equal((await purchase({ orderRef })).status, "credited");
      assert.deepEqual(await userRepository.deleteAccount(userId), { status: "deleted" });
      const [row] = await orderRows(orderRef);
      assert.match(row.user_id, /^deleted_/);
      assert.equal(row.external_reference, orderRef, "the order stays on the entry");
      await assertConsistent(row.user_id, 50);

      const other = await createUser();
      const reused = await purchase({ userId: other, orderRef, buyerEmail: emailOf(other) });
      assert.equal(reused.status, "order_already_used");
      assert.equal(reused.status === "order_already_used" && reused.existing.userId, row.user_id);
      assert.equal(await walletExists(other), false);
    });

    it("has the unique index reject a second entry for the same order even under another key", async () => {
      const orderRef = newOrderRef();
      assert.equal((await purchase({ orderRef })).status, "credited");

      await assert.rejects(
        sql`
          insert into token_ledger (id, user_id, amount, type, balance_after, idempotency_key, external_provider, external_reference)
          values (${crypto.randomUUID()}, ${userId}, 50, 'purchase', 100, ${`other:${crypto.randomUUID()}`}, 'shopier', ${orderRef})`,
        /token_ledger_external_ref_idx/
      );
      assert.equal((await orderRows(orderRef)).length, 1);
      await assertConsistent(userId, 50);
    });

    it("keeps a purchase entry append-only (migration 0022)", async () => {
      const result = await purchase();
      assert.equal(result.status, "credited");
      if (result.status !== "credited") return;
      const id = result.entry.id;

      await assert.rejects(sql`update token_ledger set amount = 500 where id = ${id}`, /token_ledger is append-only/);
      await assert.rejects(sql`update token_ledger set external_reference = 'OTHER' where id = ${id}`, /token_ledger is append-only/);
      await assert.rejects(sql`update token_ledger set note = 'x' where id = ${id}`, /token_ledger is append-only/);
      await assert.rejects(sql`delete from token_ledger where id = ${id}`, /token_ledger is append-only/);
      await assertConsistent(userId, 50);
    });

    it("leaves admin grants as they were: a grant and a purchase add up, and only the purchase names a provider", async () => {
      await grant(userId, 5);
      assert.equal((await purchase()).status, "credited");

      const rows = await sql<{ type: string; external_provider: string | null }[]>`
        select type::text as type, external_provider from token_ledger where user_id = ${userId} order by created_at, id`;
      assert.deepEqual([...rows], [
        { type: "grant", external_provider: null },
        { type: "purchase", external_provider: "shopier" },
      ]);
      await assertConsistent(userId, 55);
    });
  });

  describe("first-share reward", () => {
    const REWARD_KEY = /^first_share_reward:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

    async function rewardRows(id: string) {
      return sql<
        {
          id: string;
          amount: number;
          type: string;
          balance_after: number;
          reference_id: string | null;
          created_by: string | null;
          note: string | null;
          idempotency_key: string;
        }[]
      >`
        select id, amount, type::text as type, balance_after, reference_id, created_by, note, idempotency_key
        from token_ledger where user_id = ${id} and reference_type = 'first_share_reward'`;
    }

    async function walletExists(id: string): Promise<boolean> {
      const [row] = await sql<{ n: number }[]>`select count(*)::int as n from token_wallets where user_id = ${id}`;
      return row.n === 1;
    }

    /** Ledger rows still naming an account in any column — none may remain once it's deleted. */
    async function leftoverMentions(id: string): Promise<number> {
      const [row] = await sql<{ n: number }[]>`
        select count(*)::int as n from token_ledger
        where user_id = ${id} or created_by = ${id} or reference_id = ${id}
          or idempotency_key like ${`%${id}%`} or note like ${`%${id}%`}`;
      return row.n;
    }

    it("credits two tokens once, with an entry that carries nothing but the account", async () => {
      const result = await tokenRepository.grantFirstShareReward(userId);

      assert.equal(result.status, "granted");
      if (result.status !== "granted") return;
      assert.equal(result.balance, 2);
      assert.equal(result.entry.amount, 2);
      assert.equal(result.entry.balanceAfter, 2);
      const [row] = await rewardRows(userId);
      assert.deepEqual(
        { type: row.type, reference_id: row.reference_id, created_by: row.created_by, note: row.note },
        { type: "grant", reference_id: null, created_by: null, note: null }
      );
      assert.match(row.idempotency_key, REWARD_KEY);
      assert.ok(!row.idempotency_key.includes(userId), "the key names the account");
      await assertConsistent(userId, 2);
    });

    it("reports the reward as present only after this account's own reward entry", async () => {
      assert.equal(await tokenRepository.hasFirstShareReward(userId), false);
      await grant(userId, 1);
      assert.equal(await tokenRepository.hasFirstShareReward(userId), false, "an admin grant isn't the reward");

      assert.equal((await tokenRepository.grantFirstShareReward(userId)).status, "granted");

      assert.equal(await tokenRepository.hasFirstShareReward(userId), true);
      assert.equal(await tokenRepository.hasFirstShareReward(`${userId}-other`), false);
    });

    it("credits nothing on a second claim", async () => {
      assert.equal((await tokenRepository.grantFirstShareReward(userId)).status, "granted");

      assert.deepEqual(await tokenRepository.grantFirstShareReward(userId), { status: "already_rewarded" });

      assert.equal((await rewardRows(userId)).length, 1);
      assert.equal((await ledgerRows(userId)).length, 1);
      await assertConsistent(userId, 2);
    });

    it("credits 10 concurrent claims only once", async () => {
      const results = await Promise.all(Array.from({ length: 10 }, () => tokenRepository.grantFirstShareReward(userId)));

      const statuses = results.map((result) => result.status);
      assert.equal(statuses.filter((status) => status === "granted").length, 1, statuses.join(","));
      assert.equal(statuses.filter((status) => status === "already_rewarded").length, 9, statuses.join(","));
      assert.equal((await rewardRows(userId)).length, 1);
      await assertConsistent(userId, 2);
    });

    it("adds two tokens on top of an existing balance", async () => {
      await grant(userId, 3);

      const result = await tokenRepository.grantFirstShareReward(userId);

      assert.equal(result.status === "granted" && result.balance, 5);
      assert.equal((await rewardRows(userId))[0].balance_after, 5);
      await assertConsistent(userId, 5);
    });

    it("refuses a suspended account, a tombstone and an unknown id, writing nothing — not even a wallet", async () => {
      const suspended = await createUser();
      await sql`update users set status = 'suspended' where id = ${suspended}`;
      const tombstone = `deleted_${crypto.randomUUID()}`;
      await sql`insert into users (id, email, role, deleted_at) values (${tombstone}, ${`${tombstone}@deleted.invalid`}, 'user', now())`;
      const unknown = `missing-${crypto.randomUUID()}`;

      for (const id of [suspended, tombstone, unknown]) {
        assert.deepEqual(await tokenRepository.grantFirstShareReward(id), { status: "ineligible" }, id);
        assert.equal(await walletExists(id), false, `wallet for ${id}`);
        assert.equal((await ledgerRows(id)).length, 0, `ledger for ${id}`);
      }

      // Lifting the suspension makes the account eligible again.
      await sql`update users set status = 'active' where id = ${suspended}`;
      assert.equal((await tokenRepository.grantFirstShareReward(suspended)).status, "granted");
    });

    it("moves the entry to the deleted account's tombstone, leaving no trace of the account id", async () => {
      const result = await tokenRepository.grantFirstShareReward(userId);
      assert.equal(result.status, "granted");
      if (result.status !== "granted") return;

      assert.deepEqual(await userRepository.deleteAccount(userId), { status: "deleted" });

      const [row] = await sql<{ user_id: string; idempotency_key: string }[]>`
        select user_id, idempotency_key from token_ledger where id = ${result.entry.id}`;
      assert.match(row.user_id, /^deleted_/);
      assert.equal(row.idempotency_key, result.entry.idempotencyKey, "the entry itself is unchanged");
      assert.equal(await leftoverMentions(userId), 0, "the deleted account's id is still in the ledger");
      await assertConsistent(row.user_id, 2);
      // Neither the gone account nor its tombstone can claim again.
      assert.deepEqual(await tokenRepository.grantFirstShareReward(userId), { status: "ineligible" });
      assert.deepEqual(await tokenRepository.grantFirstShareReward(row.user_id), { status: "ineligible" });
      await assertConsistent(row.user_id, 2);
    });

    it("is once per account: a new account under the same id is eligible again", async () => {
      assert.equal((await tokenRepository.grantFirstShareReward(userId)).status, "granted");
      assert.deepEqual(await userRepository.deleteAccount(userId), { status: "deleted" });
      // The same Google sub signing in again creates a fresh row with no history.
      await sql`insert into users (id, email, role) values (${userId}, ${`${userId}@example.test`}, 'user')`;

      const again = await tokenRepository.grantFirstShareReward(userId);

      assert.equal(again.status, "granted");
      assert.equal((await rewardRows(userId)).length, 1);
      await assertConsistent(userId, 2);
    });

    it("stays consistent when a claim races the account's deletion", async () => {
      const [claim, deletion] = await Promise.all([
        tokenRepository.grantFirstShareReward(userId),
        userRepository.deleteAccount(userId),
      ]);

      assert.deepEqual(deletion, { status: "deleted" });
      assert.ok(claim.status === "granted" || claim.status === "ineligible", claim.status);
      assert.equal(await leftoverMentions(userId), 0);
      if (claim.status === "granted") {
        const [row] = await sql<{ user_id: string }[]>`select user_id from token_ledger where id = ${claim.entry.id}`;
        assert.match(row.user_id, /^deleted_/);
        await assertConsistent(row.user_id, 2);
      }
    });

    it("has the partial unique index reject a direct second reward entry, but no other entry type", async () => {
      assert.equal((await tokenRepository.grantFirstShareReward(userId)).status, "granted");

      await assert.rejects(
        sql`
          insert into token_ledger (id, user_id, amount, type, balance_after, reference_type, idempotency_key)
          values (${crypto.randomUUID()}, ${userId}, 2, 'grant', 4, 'first_share_reward', ${`first_share_reward:${crypto.randomUUID()}`})`,
        /token_ledger_first_share_reward_idx/
      );
      await grant(userId, 1);
      await grant(userId, 1);
      assert.equal((await rewardRows(userId)).length, 1);
      await assertConsistent(userId, 4);
    });

    it("keeps the reward entry append-only (migration 0022)", async () => {
      const result = await tokenRepository.grantFirstShareReward(userId);
      assert.equal(result.status, "granted");
      if (result.status !== "granted") return;
      const id = result.entry.id;

      await assert.rejects(sql`update token_ledger set amount = 200 where id = ${id}`, /token_ledger is append-only/);
      await assert.rejects(sql`update token_ledger set reference_type = 'admin_grant' where id = ${id}`, /token_ledger is append-only/);
      await assert.rejects(sql`update token_ledger set reference_id = ${userId} where id = ${id}`, /token_ledger is append-only/);
      await assert.rejects(sql`delete from token_ledger where id = ${id}`, /token_ledger is append-only/);
      await assertConsistent(userId, 2);
    });
  });

  describe("deleted accounts", () => {
    async function deleteAndFindTombstone(id: string): Promise<string> {
      const granted = await tokenRepository.grantByAdmin({
        userId: id,
        amount: 2,
        adminId,
        idempotencyKey: adminGrantIdempotencyKey(adminId, crypto.randomUUID()),
        note: null,
      });
      if (granted.status !== "granted") throw new Error(`grant failed: ${granted.status}`);
      assert.deepEqual(await userRepository.deleteAccount(id), { status: "deleted" });
      const [row] = await sql<{ user_id: string }[]>`select user_id from token_ledger where id = ${granted.entry.id}`;
      assert.match(row.user_id, /^deleted_/, "the grant entry was re-pointed to a tombstone");
      return row.user_id;
    }

    it("keeps balance == SUM(ledger) for the tombstone after account deletion", async () => {
      const tombstoneId = await deleteAndFindTombstone(userId);
      await assertConsistent(tombstoneId, 2);
      assert.equal(await userRepository.isActiveAccount(tombstoneId), false);
    });

    it("still finds a tombstone through getById, but isActiveAccount marks it inactive", async () => {
      const tombstoneId = await deleteAndFindTombstone(userId);
      assert.equal((await userRepository.getById(tombstoneId))?.id, tombstoneId);
      assert.equal(await userRepository.isActiveAccount(tombstoneId), false);
      assert.equal(await userRepository.isActiveAccount(await createUser()), true);
    });

    it("leaves vetting the target to the caller: grantByAdmin itself would credit a tombstone", async () => {
      // The repository's documented contract — grantTokens is the gate (tested below).
      const tombstoneId = await deleteAndFindTombstone(userId);
      const result = await tokenRepository.grantByAdmin({
        userId: tombstoneId,
        amount: 3,
        adminId,
        idempotencyKey: adminGrantIdempotencyKey(adminId, crypto.randomUUID()),
        note: null,
      });
      assert.equal(result.status, "granted");
      await assertConsistent(tombstoneId, 5);
    });
  });

  // The real Server Action against the real database; only the session
  // (requireAdmin/auth) and next/cache's revalidatePath are stubbed, since
  // neither exists outside a Next.js request.
  describe("grantTokens action", () => {
    let sessionUser: { id: string; role: "admin" | "user" } | null;
    let grantTokens: typeof import("./admin-actions").grantTokens;

    before(async () => {
      mock.module("next/cache", { namedExports: { revalidatePath: () => {} } });
      mock.module("@/features/auth/requireAdmin", {
        namedExports: { requireAdmin: async () => (sessionUser?.role === "admin" ? sessionUser : null) },
      });
      mock.module("@/features/auth/auth", {
        namedExports: { auth: async () => (sessionUser ? { user: sessionUser } : null) },
      });
      ({ grantTokens } = await import("./admin-actions"));
    });

    beforeEach(() => {
      sessionUser = { id: adminId, role: "admin" };
    });

    async function ledgerCount(): Promise<number> {
      const [row] = await sql<{ n: number }[]>`select count(*)::int as n from token_ledger`;
      return row.n;
    }

    it("refuses a tombstone recipient without touching the wallet or the ledger", async () => {
      const tombstoneId = await (async () => {
        const id = await createUser();
        assert.deepEqual(await userRepository.deleteAccount(id), { status: "deleted" });
        const [row] = await sql<{ id: string }[]>`select id from users where deleted_at is not null order by created_at desc limit 1`;
        return row.id;
      })();
      const ledgerBefore = await ledgerCount();

      const result = await grantTokens({ userId: tombstoneId, amount: 5, requestId: crypto.randomUUID() });

      assert.deepEqual(result, { ok: false, error: "target-user-not-found" });
      assert.equal(await ledgerCount(), ledgerBefore);
      const [wallet] = await sql`select 1 from token_wallets where user_id = ${tombstoneId}`;
      assert.equal(wallet, undefined, "no wallet row created for the tombstone");
    });

    it("refuses a tombstone that already holds a balance, leaving it unchanged", async () => {
      const tombstoneId = await deleteAndFindTombstoneForAction(userId);
      const result = await grantTokens({ userId: tombstoneId, amount: 5, requestId: crypto.randomUUID() });
      assert.deepEqual(result, { ok: false, error: "target-user-not-found" });
      await assertConsistent(tombstoneId, 2);
    });

    it("refuses an unknown user id", async () => {
      const result = await grantTokens({ userId: `missing-${crypto.randomUUID()}`, amount: 5, requestId: crypto.randomUUID() });
      assert.deepEqual(result, { ok: false, error: "target-user-not-found" });
    });

    it("still credits an active user, once per requestId", async () => {
      const requestId = crypto.randomUUID();
      const first = await grantTokens({ userId, amount: 5, note: "  welcome  ", requestId });
      const second = await grantTokens({ userId, amount: 5, note: "  welcome  ", requestId });

      assert.equal(first.ok && first.data?.status, "granted");
      assert.equal(second.ok && second.data?.status, "already_granted");
      const [entry] = await sql<{ created_by: string; note: string }[]>`select created_by, note from token_ledger where user_id = ${userId}`;
      assert.deepEqual({ ...entry }, { created_by: adminId, note: "welcome" });
      await assertConsistent(userId, 5);
    });

    it("keeps the admin gate and the 1–1000 amount limit", async () => {
      const ledgerBefore = await ledgerCount();
      sessionUser = { id: userId, role: "user" };
      assert.deepEqual(await grantTokens({ userId, amount: 5, requestId: crypto.randomUUID() }), { ok: false, error: "forbidden" });
      sessionUser = null;
      assert.deepEqual(await grantTokens({ userId, amount: 5, requestId: crypto.randomUUID() }), { ok: false, error: "auth-required" });
      sessionUser = { id: adminId, role: "admin" };
      for (const amount of [0, -1, 1.5, 1001]) {
        assert.deepEqual(await grantTokens({ userId, amount, requestId: crypto.randomUUID() }), { ok: false, error: "invalid-amount" });
      }
      assert.deepEqual(await grantTokens({ userId, amount: 5, requestId: "not-a-uuid" }), { ok: false, error: "invalid-request" });
      assert.equal(await ledgerCount(), ledgerBefore);
      await assertConsistent(userId, 0);
      const max = await grantTokens({ userId, amount: 1000, requestId: crypto.randomUUID() });
      assert.equal(max.ok, true);
      await assertConsistent(userId, 1000);
    });

    // Same session stub as grantTokens; the reward action takes no arguments at all.
    describe("claimFirstShareReward action", () => {
      let claimFirstShareReward: typeof import("./reward-actions").claimFirstShareReward;
      before(async () => {
        ({ claimFirstShareReward } = await import("./reward-actions"));
      });

      it("requires a session and writes nothing without one", async () => {
        sessionUser = null;
        const ledgerBefore = await ledgerCount();
        assert.deepEqual(await claimFirstShareReward(), { status: "auth-required" });
        assert.equal(await ledgerCount(), ledgerBefore);
      });

      it("credits the session's own account once", async () => {
        sessionUser = { id: userId, role: "user" };
        assert.deepEqual(await claimFirstShareReward(), { status: "granted", amount: 2, balance: 2 });
        assert.deepEqual(await claimFirstShareReward(), { status: "already-rewarded" });
        await assertConsistent(userId, 2);
      });

      it("refuses a suspended session account", async () => {
        await sql`update users set status = 'suspended' where id = ${userId}`;
        sessionUser = { id: userId, role: "user" };
        assert.deepEqual(await claimFirstShareReward(), { status: "ineligible" });
        await assertConsistent(userId, 0);
      });
    });

    // Same session stub as grantTokens: the real action, gate and repository on the real database.
    describe("recordShopierPurchase action", () => {
      let recordShopierPurchase: typeof import("./admin-actions").recordShopierPurchase;
      before(async () => {
        ({ recordShopierPurchase } = await import("./admin-actions"));
      });

      function input(overrides: Partial<Parameters<typeof recordShopierPurchase>[0]> = {}) {
        return {
          userId,
          packageId: "tokens-50",
          orderRef: `A-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
          buyerEmail: `${userId}@example.test`,
          ...overrides,
        };
      }

      it("keeps the admin gate: no session or a non-admin session writes nothing", async () => {
        const ledgerBefore = await ledgerCount();
        sessionUser = null;
        assert.deepEqual(await recordShopierPurchase(input()), { ok: false, error: "auth-required" });
        sessionUser = { id: userId, role: "user" };
        assert.deepEqual(await recordShopierPurchase(input()), { ok: false, error: "forbidden" });
        assert.equal(await ledgerCount(), ledgerBefore);
        await assertConsistent(userId, 0);
      });

      it("credits the package once per order, recorded under the session's admin", async () => {
        const purchase = input();
        const first = await recordShopierPurchase(purchase);
        const second = await recordShopierPurchase(purchase);

        assert.equal(first.ok && first.data.status, "credited");
        assert.equal(first.ok && first.data.tokens, 50);
        assert.equal(second.ok && second.data.status, "already_recorded");
        const [row] = await sql<{ created_by: string; type: string }[]>`
          select created_by, type::text as type from token_ledger where user_id = ${userId}`;
        assert.deepEqual({ ...row }, { created_by: adminId, type: "purchase" });
        await assertConsistent(userId, 50);
      });

      it("refuses bad input, a tombstone and an unknown account without touching the ledger", async () => {
        const ledgerBefore = await ledgerCount();
        assert.deepEqual(await recordShopierPurchase(input({ packageId: "tokens-25" })), { ok: false, error: "invalid-package" });
        assert.deepEqual(await recordShopierPurchase(input({ orderRef: " " })), { ok: false, error: "invalid-order" });
        assert.deepEqual(await recordShopierPurchase(input({ buyerEmail: "nope" })), { ok: false, error: "invalid-email" });
        assert.deepEqual(await recordShopierPurchase(input({ manualReview: true, manualReviewReason: " " })), {
          ok: false,
          error: "manual-review-reason-required",
        });
        assert.deepEqual(await recordShopierPurchase(input({ userId: `missing-${crypto.randomUUID()}` })), {
          ok: false,
          error: "target-user-not-found",
        });
        const tombstoneId = await deleteAndFindTombstoneForAction(await createUser());
        const ledgerBeforeTombstone = await ledgerCount();
        assert.deepEqual(await recordShopierPurchase(input({ userId: tombstoneId, buyerEmail: "x@example.test" })), {
          ok: false,
          error: "target-user-not-found",
        });
        assert.equal(await ledgerCount(), ledgerBeforeTombstone);
        await assertConsistent(tombstoneId, 2);
        assert.equal(ledgerBeforeTombstone - ledgerBefore, 1, "only the tombstone setup's own grant was written");
        await assertConsistent(userId, 0);
      });

      it("reports an order used by another account with where it went, crediting nothing", async () => {
        const other = await createUser();
        const purchase = input();
        assert.equal((await recordShopierPurchase(purchase)).ok, true);

        const reused = await recordShopierPurchase({ ...purchase, userId: other, buyerEmail: `${other}@example.test` });

        assert.equal(reused.ok, false);
        assert.equal(!reused.ok && reused.error, "order-already-used");
        assert.equal(!reused.ok && reused.error === "order-already-used" && reused.existingOrder.userId, userId);
        await assertConsistent(other, 0);
        await assertConsistent(userId, 50);
      });

      it("needs manual review plus a reason for differing emails", async () => {
        const differing = input({ buyerEmail: "someone-else@example.test", manualReviewReason: "checked" });
        assert.deepEqual(await recordShopierPurchase(differing), { ok: false, error: "email-mismatch" });
        await assertConsistent(userId, 0);

        const reviewed = await recordShopierPurchase({ ...differing, manualReview: true });
        assert.equal(reviewed.ok && reviewed.data.emailCheck, "manual_review");
        await assertConsistent(userId, 50);
      });
    });

    async function deleteAndFindTombstoneForAction(id: string): Promise<string> {
      const granted = await grantTokens({ userId: id, amount: 2, requestId: crypto.randomUUID() });
      assert.equal(granted.ok, true);
      assert.deepEqual(await userRepository.deleteAccount(id), { status: "deleted" });
      const [row] = await sql<{ user_id: string }[]>`select user_id from token_ledger where id = ${granted.data!.ledgerEntryId}`;
      assert.match(row.user_id, /^deleted_/);
      return row.user_id;
    }
  });
});

describe("token ledger history on PostgreSQL", { skip: TEST_URL ? false : "TOKEN_TEST_DATABASE_URL is not set" }, () => {
  let sql: ReturnType<typeof postgres>;
  let adminId: string;

  before(async () => {
    delete process.env.APP_ENV;
    process.env.DATABASE_URL = TEST_URL!;
    sql = postgres(TEST_URL!, { max: 2, onnotice: () => {} });
    await migrate(drizzle(sql), { migrationsFolder: "drizzle" });
    adminId = `test-${crypto.randomUUID()}`;
    await sql`insert into users (id, email, name, role) values (${adminId}, ${`${adminId}@example.test`}, 'Test Admin', 'admin')`;
  });

  after(async () => {
    await sql?.end({ timeout: 5 });
  });

  async function createUser(): Promise<string> {
    const id = `test-${crypto.randomUUID()}`;
    await sql`insert into users (id, email) values (${id}, ${`${id}@example.test`})`;
    return id;
  }

  async function walk(limit: number): Promise<string[]> {
    const ids: string[] = [];
    let before: LedgerCursor | null = null;
    for (let page = 0; page < 1000; page++) {
      const result: LedgerPage = await tokenRepository.listLedger({ limit, before });
      ids.push(...result.entries.map((entry) => entry.id));
      if (!result.nextCursor) return ids;
      before = result.nextCursor;
    }
    throw new Error("pagination did not terminate");
  }

  async function snapshot(): Promise<string> {
    const [row] = await sql<{ ledger: string | null; wallets: string | null }[]>`
      select
        (select md5(string_agg(t::text, '|' order by t.id)) from token_ledger t) as ledger,
        (select md5(string_agg(w::text, '|' order by w.user_id)) from token_wallets w) as wallets`;
    return `${row.ledger}/${row.wallets}`;
  }

  async function allPages(deps: TokenHistoryDeps): Promise<TokenHistoryRow[]> {
    const rows: TokenHistoryRow[] = [];
    let cursor: string | null = null;
    do {
      const result: TokenHistoryResult = await loadTokenHistory({ cursor }, deps);
      if (result.status !== "ok") throw new Error("unauthorized");
      rows.push(...result.rows);
      cursor = result.nextCursor;
    } while (cursor);
    return rows;
  }

  const realDeps = (): TokenHistoryDeps => ({
    requireAdmin: async () => ({ id: adminId }),
    listLedger: (input) => tokenRepository.listLedger(input),
    getActiveUsersByIds: (ids) => userRepository.getActiveByIds(ids),
  });

  it("getActiveByIds leaves out a deleted account's tombstone", async () => {
    const live = await createUser();
    const doomed = await createUser();
    assert.deepEqual(await userRepository.deleteAccount(doomed), { status: "deleted" });
    const [{ id: tombstoneId }] = await sql<{ id: string }[]>`
      select id from users where deleted_at is not null order by created_at desc limit 1`;

    const found = await userRepository.getActiveByIds([live, tombstoneId, doomed]);
    assert.deepEqual(found.map((user) => user.id), [live]);
    assert.deepEqual(await userRepository.getActiveByIds([]), []);
  });

  it("pages newest first by exact microseconds, breaking timestamp ties by id", async () => {
    const owner = await createUser();
    const rows = [
      { id: "hist-e", at: "2099-01-01 00:00:00+00" },
      { id: "hist-d", at: "2099-01-01 00:00:00.000001+00" },
      { id: "hist-b", at: "2099-01-01 00:00:00.000002+00" },
      { id: "hist-c", at: "2099-01-01 00:00:00.000002+00" },
      { id: "hist-a", at: "2099-01-01 00:00:00.000003+00" },
    ];
    for (const [index, row] of rows.entries()) {
      await sql`
        insert into token_ledger (id, user_id, amount, type, balance_after, idempotency_key, created_at)
        values (${`${row.id}-${owner}`}, ${owner}, 1, 'grant', ${index + 1}, ${`hist:${row.id}:${owner}`}, ${row.at}::timestamptz)`;
    }
    await sql`insert into token_wallets (user_id, balance) values (${owner}, ${rows.length})`;

    // Five rows inside 3 microseconds — a millisecond-rounded cursor would skip some.
    const firstPages = (await walk(2)).slice(0, 5);
    assert.deepEqual(
      firstPages,
      ["hist-a", "hist-c", "hist-b", "hist-d", "hist-e"].map((id) => `${id}-${owner}`)
    );
  });

  it("walks the whole ledger page by page with no gaps or duplicates", async () => {
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from token_ledger`;
    assert.ok(n > 20, `expected a populated ledger, got ${n}`);
    const expected = (await sql<{ id: string }[]>`select id from token_ledger order by created_at desc, id desc`).map((row) => row.id);

    for (const limit of [1, 7, 100]) {
      const ids = await walk(limit);
      assert.equal(new Set(ids).size, ids.length, `duplicates at limit ${limit}`);
      assert.deepEqual(ids, expected, `order at limit ${limit}`);
    }
  });

  it("clamps the page size to 1..100", async () => {
    await sql`
      insert into token_ledger (id, user_id, amount, type, balance_after, idempotency_key)
      select 'bulk-' || g || '-' || ${adminId}, ${adminId}, 1, 'grant', g, 'bulk:' || g || ':' || ${adminId}
      from generate_series(1, 120) as g`;
    await sql`insert into token_wallets (user_id, balance) values (${adminId}, 120)`;

    assert.equal((await tokenRepository.listLedger({ limit: 1000 })).entries.length, MAX_LEDGER_PAGE_SIZE);
    assert.equal((await tokenRepository.listLedger({ limit: 0 })).entries.length, 1);
    assert.equal((await tokenRepository.listLedger({ limit: -5 })).entries.length, 1);
  });

  it("reading the history changes no balance and no ledger entry", async () => {
    const userId = await createUser();
    await tokenRepository.grantByAdmin({
      userId,
      amount: 3,
      adminId,
      idempotencyKey: adminGrantIdempotencyKey(adminId, crypto.randomUUID()),
      note: null,
    });
    const before = await snapshot();

    await walk(7);
    await allPages(realDeps());

    assert.equal(await snapshot(), before);
  });

  it("an unauthorized request never reaches the ledger", async () => {
    let queried = false;
    const result = await loadTokenHistory(
      { cursor: null },
      {
        ...realDeps(),
        requireAdmin: async () => null,
        listLedger: async () => {
          queried = true;
          return { entries: [], nextCursor: null };
        },
      }
    );
    assert.deepEqual(result, { status: "unauthorized" });
    assert.equal(queried, false);
  });

  it("shows deleted accounts without tombstone ids or emails, and live accounts by name", async () => {
    const userId = await createUser();
    const granted = await tokenRepository.grantByAdmin({
      userId,
      amount: 2,
      adminId,
      idempotencyKey: adminGrantIdempotencyKey(adminId, crypto.randomUUID()),
      note: "before deletion",
    });
    if (granted.status !== "granted") throw new Error(`grant failed: ${granted.status}`);
    assert.deepEqual(await userRepository.deleteAccount(userId), { status: "deleted" });

    const rows = await allPages(realDeps());
    const row = rows.find((candidate) => candidate.id === granted.entry.id);
    assert.ok(row, "the deleted account's entry is still listed");
    assert.deepEqual(row.user, { kind: "deleted" });
    assert.deepEqual(row.createdBy, { kind: "active", name: "Test Admin", email: `${adminId}@example.test` });
    assert.equal(row.note, "before deletion");

    const payload = JSON.stringify(rows);
    assert.ok(!payload.includes("deleted_"), "a tombstone id leaked");
    assert.ok(!payload.includes("@deleted.invalid"), "a tombstone email leaked");
  });
});

// Migration 0022's triggers: token_ledger accepts INSERT only, plus account
// deletion's re-pointing of user_id/created_by to its own tombstone. Run as
// the non-superuser table owner npm run test:db:tokens creates.
describe("token ledger guard on PostgreSQL", { skip: TEST_URL ? false : "TOKEN_TEST_DATABASE_URL is not set" }, () => {
  const GUARD_MIGRATION = "drizzle/0022_token_ledger_append_only.sql";
  const REJECTED = /token_ledger is append-only/;
  type Sql = ReturnType<typeof postgres>;
  let sql: Sql;
  let adminId: string;

  before(async () => {
    delete process.env.APP_ENV;
    process.env.DATABASE_URL = TEST_URL!;
    sql = postgres(TEST_URL!, { max: 2, onnotice: () => {} });
    await migrate(drizzle(sql), { migrationsFolder: "drizzle" });
    adminId = await createUser("admin");
  });

  after(async () => {
    await sql?.end({ timeout: 5 });
  });

  async function createUser(role: "user" | "admin" = "user"): Promise<string> {
    const id = `test-${crypto.randomUUID()}`;
    await sql`insert into users (id, email, role) values (${id}, ${`${id}@example.test`}, ${role})`;
    return id;
  }

  async function grant(userId: string, amount: number, by = adminId): Promise<string> {
    const result = await tokenRepository.grantByAdmin({
      userId,
      amount,
      adminId: by,
      idempotencyKey: adminGrantIdempotencyKey(by, crypto.randomUUID()),
      note: "guard test",
    });
    if (result.status !== "granted") throw new Error(`grant failed: ${result.status}`);
    return result.entry.id;
  }

  /** Everything but user_id/created_by, as text — what a re-pointing must leave untouched. */
  async function frozenColumns(id: string): Promise<string> {
    const [row] = await sql<{ frozen: string }[]>`
      select (to_jsonb(t) - 'user_id' - 'created_by')::text as frozen from token_ledger t where id = ${id}`;
    return row.frozen;
  }

  async function ledgerRow(id: string): Promise<{ user_id: string; created_by: string | null }> {
    const [row] = await sql<{ user_id: string; created_by: string | null }[]>`
      select user_id, created_by from token_ledger where id = ${id}`;
    return { user_id: row.user_id, created_by: row.created_by };
  }

  /** A tombstone row the way deleteAccount writes one. */
  async function insertTombstone(tx: Sql): Promise<string> {
    const id = `deleted_${crypto.randomUUID()}`;
    await tx`insert into users (id, email, role, deleted_at) values (${id}, ${`${id}@deleted.invalid`}, 'user', now())`;
    return id;
  }

  class Rollback extends Error {}
  /** Runs fn in a transaction that is always rolled back, so accepted test writes leave nothing behind. */
  async function inRolledBackTransaction(fn: (tx: Sql) => Promise<void>): Promise<void> {
    await assert.rejects(
      sql.begin(async (tx) => {
        await fn(tx as unknown as Sql);
        throw new Rollback();
      }),
      Rollback
    );
  }

  /** What deleteAccount does after re-pointing the ledger: move the wallet too, then delete the user row. */
  async function finishDeletion(tx: Sql, userId: string, tombstone: string): Promise<void> {
    await tx`update token_wallets set user_id = ${tombstone} where user_id = ${userId}`;
    await tx`delete from users where id = ${userId}`;
  }

  async function userExists(id: string): Promise<boolean> {
    const [row] = await sql<{ n: number }[]>`select count(*)::int as n from users where id = ${id}`;
    return row.n === 1;
  }

  it("runs as a non-superuser that owns token_ledger, with every guard trigger enabled", async () => {
    const [role] = await sql<{ rolsuper: boolean; rolbypassrls: boolean; rolreplication: boolean; owns: boolean }[]>`
      select r.rolsuper, r.rolbypassrls, r.rolreplication,
        (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'public.token_ledger'::regclass) = current_user as owns
      from pg_roles r where r.rolname = current_user`;
    assert.deepEqual({ ...role }, { rolsuper: false, rolbypassrls: false, rolreplication: false, owns: true });

    const triggers = await sql<{ tgname: string; tgenabled: string; deferrable: boolean; deferred: boolean }[]>`
      select tgname, tgenabled, tgdeferrable as deferrable, tginitdeferred as deferred from pg_trigger
      where tgrelid in ('public.token_ledger'::regclass, 'public.users'::regclass) and not tgisinternal order by tgname`;
    assert.deepEqual(
      triggers.map((trigger) => ({ ...trigger })),
      [
        { tgname: "token_ledger_guard_row", tgenabled: "O", deferrable: false, deferred: false },
        { tgname: "token_ledger_guard_truncate", tgenabled: "O", deferrable: false, deferred: false },
        { tgname: "token_ledger_repoint_deferred", tgenabled: "O", deferrable: true, deferred: true },
        { tgname: "users_tombstone_guard_row", tgenabled: "O", deferrable: false, deferred: false },
      ]
    );
  });

  it("rejects changing any recorded value of an entry", async () => {
    const userId = await createUser();
    const id = await grant(userId, 3);
    const before = await frozenColumns(id);
    const changes: Record<string, string> = {
      amount: "amount = amount + 1",
      type: "type = 'refund'",
      balance_after: "balance_after = balance_after + 1",
      note: "note = 'rewritten'",
      idempotency_key: "idempotency_key = idempotency_key || ':x'",
      reference_type: "reference_type = 'other'",
      reference_id: "reference_id = 'other'",
      external_provider: "external_provider = 'shopier'",
      external_reference: "external_reference = 'x'",
      created_at: "created_at = created_at - interval '1 day'",
      id: "id = id || '-x'",
    };
    for (const [column, assignment] of Object.entries(changes)) {
      await assert.rejects(sql.unsafe(`update token_ledger set ${assignment} where id = $1`, [id]), REJECTED, column);
    }
    await assert.rejects(sql`update token_ledger set user_id = user_id where id = ${id}`, REJECTED, "a no-op update");
    assert.equal(await frozenColumns(id), before);
    assert.equal((await ledgerRow(id)).user_id, userId);
  });

  it("rejects moving an entry to another active user", async () => {
    const userId = await createUser();
    const other = await createUser();
    const id = await grant(userId, 1);
    await assert.rejects(sql`update token_ledger set user_id = ${other} where id = ${id}`, REJECTED);
    await assert.rejects(sql`update token_ledger set created_by = ${other} where id = ${id}`, REJECTED);
    await assert.rejects(sql`update token_ledger set created_by = null where id = ${id}`, REJECTED);
    assert.deepEqual(await ledgerRow(id), { user_id: userId, created_by: adminId });
  });

  it("accepts re-pointing only user_id/created_by to a tombstone created in the same transaction", async () => {
    const userId = await createUser();
    const id = await grant(userId, 2);
    const before = await frozenColumns(id);
    await inRolledBackTransaction(async (tx) => {
      const tombstone = await insertTombstone(tx);
      await tx`update token_ledger set user_id = ${tombstone} where id = ${id}`;
      await tx`update token_ledger set created_by = ${tombstone} where id = ${id}`;
      const [row] = await tx<{ user_id: string; created_by: string; frozen: string }[]>`
        select user_id, created_by, (to_jsonb(t) - 'user_id' - 'created_by')::text as frozen from token_ledger t where id = ${id}`;
      assert.deepEqual(
        { user_id: row.user_id, created_by: row.created_by, frozen: row.frozen },
        { user_id: tombstone, created_by: tombstone, frozen: before }
      );
    });
    assert.equal((await ledgerRow(id)).user_id, userId, "rolled back");
  });

  it("rejects a re-pointing that also changes another column", async () => {
    const userId = await createUser();
    const id = await grant(userId, 2);
    await inRolledBackTransaction(async (tx) => {
      const tombstone = await insertTombstone(tx);
      await assert.rejects(tx`update token_ledger set user_id = ${tombstone}, amount = 99 where id = ${id}`, REJECTED);
    });
    await inRolledBackTransaction(async (tx) => {
      const tombstone = await insertTombstone(tx);
      await assert.rejects(tx`update token_ledger set created_by = ${tombstone}, note = 'x' where id = ${id}`, REJECTED);
    });
    assert.equal((await ledgerRow(id)).user_id, userId);
  });

  it("rejects a tombstone created by an earlier transaction", async () => {
    const userId = await createUser();
    const id = await grant(userId, 1);
    const tombstone = await insertTombstone(sql);
    await assert.rejects(sql`update token_ledger set user_id = ${tombstone} where id = ${id}`, REJECTED);
    await assert.rejects(
      sql.begin((tx) => tx`update token_ledger set user_id = ${tombstone} where id = ${id}`),
      REJECTED
    );
    assert.equal((await ledgerRow(id)).user_id, userId);
  });

  it("rejects moving an entry from one tombstone to another", async () => {
    const userId = await createUser();
    const id = await grant(userId, 1);
    assert.deepEqual(await userRepository.deleteAccount(userId), { status: "deleted" });
    const first = (await ledgerRow(id)).user_id;
    assert.match(first, /^deleted_/);
    await inRolledBackTransaction(async (tx) => {
      const second = await insertTombstone(tx);
      await assert.rejects(tx`update token_ledger set user_id = ${second} where id = ${id}`, REJECTED);
    });
    assert.equal((await ledgerRow(id)).user_id, first);
  });

  it("rejects a tombstone inserted inside a savepoint (fails closed)", async () => {
    // Drizzle's nested transactions are savepoints; deleteAccount is a top-level transaction.
    const userId = await createUser();
    const id = await grant(userId, 1);
    await inRolledBackTransaction(async (tx) => {
      const tombstone = await (tx as unknown as postgres.TransactionSql).savepoint((sp) =>
        insertTombstone(sp as unknown as Sql)
      );
      await assert.rejects(tx`update token_ledger set user_id = ${tombstone} where id = ${id}`, REJECTED);
    });
  });

  it("rejects DELETE and TRUNCATE", async () => {
    const userId = await createUser();
    const id = await grant(userId, 1);
    await assert.rejects(sql`delete from token_ledger where id = ${id}`, REJECTED);
    await assert.rejects(sql`delete from token_ledger where user_id = ${userId}`, REJECTED);
    // Foreign keys from unlocks and refund-accounting rows also prevent TRUNCATE;
    // PostgreSQL must reject it whether the caller omits or supplies CASCADE.
    await assert.rejects(sql`truncate token_ledger`, /cannot truncate a table referenced in a foreign key constraint/);
    await assert.rejects(sql`truncate token_ledger cascade`);
    await assert.rejects(sql`truncate token_ledger, memory_pdf_unlocks`);
    await assert.rejects(sql`truncate users cascade`, REJECTED);
    assert.equal((await ledgerRow(id)).user_id, userId);
    const [row] = await sql<{ n: number }[]>`select count(*)::int as n from users where id = ${userId}`;
    assert.equal(row.n, 1, "the rejected TRUNCATE ... CASCADE left users untouched");
  });

  it("lets the real deleteAccount re-point user_id and created_by, leaving everything else and the balance intact", async () => {
    const userId = await createUser();
    // grantByAdmin doesn't check the role, so a non-admin "creator" exercises the created_by re-pointing too.
    const creator = await createUser();
    const granted = await grant(userId, 3);
    const createdByCreator = await grant(await createUser(), 4, creator);
    const message = `msg-${crypto.randomUUID()}`;
    const project = `proj-${crypto.randomUUID()}`;
    await sql`
      insert into messages (id, content, author_id, author_name, language, template_id, status)
      values (${message}, 'test', ${userId}, 'anonymous', 'en', 'standard-classic', 'approved')`;
    await sql`
      insert into memory_projects (id, message_id, created_by, capture_mode, output_type)
      values (${project}, ${message}, ${userId}, 'note_only', 'personal_pdf')`;
    const consumed = await tokenRepository.consumeForMemoryPdfUnlock({ userId, memoryProjectId: project });
    assert.equal(consumed.status, "newly_unlocked");

    const ids = (await sql<{ id: string }[]>`select id from token_ledger where user_id = ${userId}`).map((row) => row.id);
    assert.equal(ids.length, 2);
    const frozenBefore = await Promise.all([...ids, createdByCreator].map(frozenColumns));

    assert.deepEqual(await userRepository.deleteAccount(userId), { status: "deleted" });
    assert.deepEqual(await userRepository.deleteAccount(creator), { status: "deleted" });

    const tombstone = (await ledgerRow(granted)).user_id;
    assert.match(tombstone, /^deleted_/);
    for (const id of ids) assert.equal((await ledgerRow(id)).user_id, tombstone);
    assert.match((await ledgerRow(createdByCreator)).created_by ?? "", /^deleted_/);
    assert.deepEqual(await Promise.all([...ids, createdByCreator].map(frozenColumns)), frozenBefore);

    const [row] = await sql<{ balance: number; total: number }[]>`
      select (select balance from token_wallets where user_id = ${tombstone}) as balance,
        (select sum(amount)::int from token_ledger where user_id = ${tombstone}) as total`;
    assert.deepEqual({ balance: row.balance, total: row.total }, { balance: 2, total: 2 });
    const [left] = await sql<{ n: number }[]>`select count(*)::int as n from token_ledger where user_id = ${userId}`;
    assert.equal(left.n, 0);
  });

  it("rolls the whole account deletion back when the guard rejects a ledger update", async () => {
    // A stand-in for a buggy write: a test-only trigger, firing before the guard (same-event
    // triggers run in name order), changes the note of this user's entries during
    // deleteAccount's re-pointing. The guard must reject it and the deletion leave nothing behind.
    const userId = await createUser();
    const id = await grant(userId, 2);
    const before = await frozenColumns(id);
    const [{ users: usersBefore }] = await sql<{ users: number }[]>`select count(*)::int as users from users`;
    await sql.unsafe(`
      create function test_tamper_ledger() returns trigger language plpgsql as $$
      begin new.note := 'tampered'; return new; end; $$`);
    await sql.unsafe(`
      create trigger token_ledger_aaa_tamper before update on token_ledger for each row
      when (old.user_id = '${userId}') execute function test_tamper_ledger()`);
    try {
      await assert.rejects(userRepository.deleteAccount(userId), (error: unknown) =>
        REJECTED.test(`${error} ${(error as { cause?: unknown }).cause}`)
      );
    } finally {
      await sql.unsafe(`drop trigger token_ledger_aaa_tamper on token_ledger`);
      await sql.unsafe(`drop function test_tamper_ledger()`);
    }

    assert.equal(await userRepository.isActiveAccount(userId), true, "the user row is still there");
    assert.equal((await ledgerRow(id)).user_id, userId);
    assert.equal(await frozenColumns(id), before);
    const [row] = await sql<{ users: number; wallet: number }[]>`
      select (select count(*)::int from users) as users,
        (select balance from token_wallets where user_id = ${userId}) as wallet`;
    assert.deepEqual({ users: row.users, wallet: row.wallet }, { users: usersBefore, wallet: 2 }, "no tombstone left, wallet untouched");
    assert.deepEqual(await userRepository.deleteAccount(userId), { status: "deleted" }, "deletion works once the bug is gone");
  });

  // The deferred check (token_ledger_repoint_deferred) runs at COMMIT: a re-pointing is kept only
  // when the account it moved away from was deleted by the same transaction.
  const NOT_DELETED = /token_ledger is append-only: (user_id|created_by) was re-pointed but its account was not deleted by this transaction/;
  const TOMBSTONE_GUARD = /users tombstone guard/;

  it("commits a re-pointing done in separate user_id and created_by UPDATEs together with the source account's deletion", async () => {
    const userId = await createUser();
    const other = await createUser();
    const own = await grant(userId, 2); // user_id = userId, created_by = admin
    const selfMade = await grant(userId, 3, userId); // user_id = created_by = userId: the same row, two UPDATEs
    const forOther = await grant(other, 4, userId); // only created_by = userId
    const frozenBefore = await Promise.all([own, selfMade, forOther].map(frozenColumns));

    const tombstone = await sql.begin(async (tx) => {
      const id = await insertTombstone(tx as unknown as Sql);
      await tx`update token_ledger set user_id = ${id} where user_id = ${userId}`;
      await tx`update token_ledger set created_by = ${id} where created_by = ${userId}`;
      await finishDeletion(tx as unknown as Sql, userId, id);
      return id;
    });

    assert.equal(await userExists(userId), false);
    assert.deepEqual(await ledgerRow(own), { user_id: tombstone, created_by: adminId });
    assert.deepEqual(await ledgerRow(selfMade), { user_id: tombstone, created_by: tombstone });
    assert.deepEqual(await ledgerRow(forOther), { user_id: other, created_by: tombstone });
    assert.deepEqual(await Promise.all([own, selfMade, forOther].map(frozenColumns)), frozenBefore);
    const [row] = await sql<{ balance: number; total: number }[]>`
      select (select balance from token_wallets where user_id = ${tombstone}) as balance,
        (select sum(amount)::int from token_ledger where user_id = ${tombstone}) as total`;
    assert.deepEqual({ balance: row.balance, total: row.total }, { balance: 5, total: 5 });
  });

  it("rejects at COMMIT a re-pointing whose source account isn't deleted", async () => {
    const userId = await createUser();
    const other = await createUser();
    const own = await grant(userId, 2);
    const forOther = await grant(other, 1, userId);
    const [{ users: usersBefore }] = await sql<{ users: number }[]>`select count(*)::int as users from users`;

    // user_id alone — even with the wallet moved too, as long as the user row stays.
    await assert.rejects(
      sql.begin(async (tx) => {
        const tombstone = await insertTombstone(tx as unknown as Sql);
        await tx`update token_ledger set user_id = ${tombstone} where user_id = ${userId}`;
        await tx`update token_wallets set user_id = ${tombstone} where user_id = ${userId}`;
      }),
      NOT_DELETED
    );
    // created_by alone.
    await assert.rejects(
      sql.begin(async (tx) => {
        const tombstone = await insertTombstone(tx as unknown as Sql);
        await tx`update token_ledger set created_by = ${tombstone} where id = ${forOther}`;
      }),
      NOT_DELETED
    );

    assert.equal(await userExists(userId), true);
    assert.deepEqual(await ledgerRow(own), { user_id: userId, created_by: adminId });
    assert.deepEqual(await ledgerRow(forOther), { user_id: other, created_by: userId });
    const [row] = await sql<{ users: number; wallet: number }[]>`
      select (select count(*)::int from users) as users,
        (select balance from token_wallets where user_id = ${userId}) as wallet`;
    assert.deepEqual({ users: row.users, wallet: row.wallet }, { users: usersBefore, wallet: 2 }, "no tombstone left, wallet back");
  });

  it("rejects at COMMIT when the source account's deletion was undone by ROLLBACK TO SAVEPOINT", async () => {
    const userId = await createUser();
    const id = await grant(userId, 1);
    await assert.rejects(
      sql.begin(async (tx) => {
        const tombstone = await insertTombstone(tx as unknown as Sql);
        await tx`update token_ledger set user_id = ${tombstone} where user_id = ${userId}`;
        await tx`update token_wallets set user_id = ${tombstone} where user_id = ${userId}`;
        await assert.rejects(
          (tx as unknown as postgres.TransactionSql).savepoint(async (sp) => {
            await sp`delete from users where id = ${userId}`;
            throw new Rollback();
          }),
          Rollback
        );
      }),
      NOT_DELETED
    );
    assert.equal(await userExists(userId), true);
    assert.equal((await ledgerRow(id)).user_id, userId);
  });

  it("keeps nothing to check when the re-pointing itself was rolled back to a savepoint", async () => {
    const userId = await createUser();
    const id = await grant(userId, 1);
    await sql.begin(async (tx) => {
      const tombstone = await insertTombstone(tx as unknown as Sql);
      await assert.rejects(
        (tx as unknown as postgres.TransactionSql).savepoint(async (sp) => {
          await sp`update token_ledger set user_id = ${tombstone} where user_id = ${userId}`;
          throw new Rollback();
        }),
        Rollback
      );
    });
    assert.equal(await userExists(userId), true);
    assert.equal((await ledgerRow(id)).user_id, userId);
  });

  it("fails closed when the deferred check is forced to run immediately", async () => {
    const userId = await createUser();
    const id = await grant(userId, 1);
    await assert.rejects(
      sql.begin(async (tx) => {
        await tx`set constraints token_ledger_repoint_deferred immediate`;
        const tombstone = await insertTombstone(tx as unknown as Sql);
        await tx`update token_ledger set user_id = ${tombstone} where user_id = ${userId}`;
      }),
      NOT_DELETED
    );
    assert.equal((await ledgerRow(id)).user_id, userId);
  });

  it("can't turn an active user or an old tombstone into a same-transaction tombstone by UPDATE", async () => {
    const userId = await createUser();
    const id = await grant(userId, 1);
    const victim = await createUser();
    const oldTombstone = await insertTombstone(sql);
    const [{ xmin: oldXmin }] = await sql<{ xmin: string }[]>`select xmin::text from users where id = ${oldTombstone}`;

    // Marking an active user deleted, in or outside a transaction.
    await assert.rejects(sql`update users set deleted_at = now() where id = ${victim}`, TOMBSTONE_GUARD);
    // Touching an old tombstone (which would give it the current xmin), or reviving it.
    await assert.rejects(sql`update users set name = 'x' where id = ${oldTombstone}`, TOMBSTONE_GUARD);
    await assert.rejects(sql`update users set deleted_at = null where id = ${oldTombstone}`, TOMBSTONE_GUARD);
    await assert.rejects(sql`update users set deleted_at = deleted_at where id = ${oldTombstone}`, TOMBSTONE_GUARD);
    await assert.rejects(
      sql`insert into users (id, email, role) values (${oldTombstone}, 'x@example.test', 'user')
        on conflict (id) do update set name = 'x'`,
      TOMBSTONE_GUARD
    );
    // A tombstone inserted by this transaction is immutable too.
    await inRolledBackTransaction(async (tx) => {
      const fresh = await insertTombstone(tx);
      await assert.rejects(tx`update users set updated_at = now() where id = ${fresh}`, TOMBSTONE_GUARD);
    });
    // The whole attempt in one transaction: the first step already aborts it.
    await assert.rejects(
      sql.begin(async (tx) => {
        await tx`update users set updated_at = now() where id = ${oldTombstone}`;
        await tx`update token_ledger set user_id = ${oldTombstone} where user_id = ${userId}`;
        await tx`delete from users where id = ${userId}`;
      }),
      TOMBSTONE_GUARD
    );
    await assert.rejects(
      sql.begin(async (tx) => {
        await tx`update users set deleted_at = now() where id = ${victim}`;
        await tx`update token_ledger set user_id = ${victim} where user_id = ${userId}`;
      }),
      TOMBSTONE_GUARD
    );

    const [after] = await sql<{ xmin: string }[]>`select xmin::text from users where id = ${oldTombstone}`;
    assert.equal(after.xmin, oldXmin, "the old tombstone was never rewritten");
    assert.equal(await userRepository.isActiveAccount(victim), true);
    assert.equal((await ledgerRow(id)).user_id, userId);
    // Ordinary updates of active users are untouched by the users guard.
    await sql`update users set name = 'still fine', deleted_at = null where id = ${victim}`;
  });

  it("handles NULL created_by: never a source, never a target", async () => {
    const userId = await createUser();
    const id = `test-entry-${crypto.randomUUID()}`;
    // A system-originated entry (like a consume) has no created_by.
    await sql`
      insert into token_ledger (id, user_id, amount, type, balance_after, idempotency_key)
      values (${id}, ${userId}, 1, 'adjustment', 1, ${`test:${id}`})`;
    await inRolledBackTransaction(async (tx) => {
      const tombstone = await insertTombstone(tx);
      await assert.rejects(tx`update token_ledger set created_by = ${tombstone} where id = ${id}`, REJECTED);
    });
    const granted = await grant(userId, 1);
    await inRolledBackTransaction(async (tx) => {
      const tombstone = await insertTombstone(tx);
      await tx`update token_ledger set user_id = ${tombstone} where id = ${granted}`;
      await assert.rejects(tx`update token_ledger set created_by = null where id = ${granted}`, REJECTED);
    });
    // user_id is NOT NULL: a NULL target never gets as far as the guard's checks.
    await assert.rejects(sql`update token_ledger set user_id = null where id = ${id}`);
    assert.deepEqual(await ledgerRow(id), { user_id: userId, created_by: null });
    assert.deepEqual(await ledgerRow(granted), { user_id: userId, created_by: adminId });
  });

  it("rolls a multi-entry account deletion back completely when it fails at COMMIT", async () => {
    // A stand-in for a buggy deletion: a test-only trigger silently skips the user row's DELETE,
    // so deleteAccount re-points every entry but the account survives — the deferred check must
    // abort the COMMIT and leave every row as it was.
    const userId = await createUser();
    const other = await createUser();
    const entries = [await grant(userId, 2), await grant(userId, 3, userId), await grant(other, 1, userId)];
    const frozenBefore = await Promise.all(entries.map(frozenColumns));
    const rowsBefore = await Promise.all(entries.map(ledgerRow));
    const [{ users: usersBefore }] = await sql<{ users: number }[]>`select count(*)::int as users from users`;
    await sql.unsafe(`
      create function test_skip_user_delete() returns trigger language plpgsql as $$
      begin return null; end; $$`);
    await sql.unsafe(`
      create trigger users_aaa_skip_delete before delete on users for each row
      when (old.id = '${userId}') execute function test_skip_user_delete()`);
    try {
      await assert.rejects(userRepository.deleteAccount(userId), (error: unknown) =>
        NOT_DELETED.test(`${error} ${(error as { cause?: unknown }).cause}`)
      );
    } finally {
      await sql.unsafe(`drop trigger users_aaa_skip_delete on users`);
      await sql.unsafe(`drop function test_skip_user_delete()`);
    }

    assert.equal(await userRepository.isActiveAccount(userId), true);
    assert.deepEqual(await Promise.all(entries.map(ledgerRow)), rowsBefore);
    assert.deepEqual(await Promise.all(entries.map(frozenColumns)), frozenBefore);
    const [row] = await sql<{ users: number; wallet: number; total: number }[]>`
      select (select count(*)::int from users) as users,
        (select balance from token_wallets where user_id = ${userId}) as wallet,
        (select sum(amount)::int from token_ledger where user_id = ${userId}) as total`;
    assert.deepEqual({ ...row }, { users: usersBefore, wallet: 5, total: 5 }, "no tombstone left, balance == SUM(ledger)");
    assert.deepEqual(await userRepository.deleteAccount(userId), { status: "deleted" }, "deletion works once the bug is gone");
  });

  it("can't be bypassed with the app role's ordinary privileges", async () => {
    await assert.rejects(sql`set session_replication_role = replica`, /permission denied/);
    // DISABLE TRIGGER ALL also covers the FK constraint triggers, which only a superuser may disable.
    await assert.rejects(sql`alter table token_ledger disable trigger all`, /permission denied/);
  });

  it("documents the limit: the table owner can disable the guard itself", async () => {
    // Not a guarantee — the trigger stops application bugs, not the owner role. Rolled back.
    const userId = await createUser();
    const id = await grant(userId, 1);
    await inRolledBackTransaction(async (tx) => {
      await tx`alter table token_ledger disable trigger token_ledger_guard_row`;
      await tx`update token_ledger set note = 'owner bypass' where id = ${id}`;
    });
    const [trigger] = await sql<{ tgenabled: string }[]>`
      select tgenabled from pg_trigger where tgname = 'token_ledger_guard_row'`;
    assert.equal(trigger.tgenabled, "O", "the rollback re-enabled it");
    await assert.rejects(sql`update token_ledger set note = 'x' where id = ${id}`, REJECTED);
  });

  it("is a no-op when the migrations, or the guard migration's own SQL, are applied again", async () => {
    const countMigrations = async () =>
      (await sql<{ n: number }[]>`select count(*)::int as n from drizzle.__drizzle_migrations`)[0].n;
    const applied = await countMigrations();
    await migrate(drizzle(sql), { migrationsFolder: "drizzle" });
    assert.equal(await countMigrations(), applied);

    for (const statement of readFileSync(GUARD_MIGRATION, "utf-8").split("--> statement-breakpoint")) {
      await sql.unsafe(statement);
    }
    const [row] = await sql<{ triggers: number; functions: number }[]>`
      select (select count(*)::int from pg_trigger
          where tgrelid in ('public.token_ledger'::regclass, 'public.users'::regclass) and not tgisinternal) as triggers,
        (select count(*)::int from pg_proc
          where proname in ('token_ledger_guard', 'token_ledger_repoint_check', 'users_tombstone_guard')) as functions`;
    assert.deepEqual({ triggers: row.triggers, functions: row.functions }, { triggers: 4, functions: 3 });
    const userId = await createUser();
    const id = await grant(userId, 1);
    await assert.rejects(sql`delete from token_ledger where id = ${id}`, REJECTED);
  });
  it("enforces refund external-reference consistency in PostgreSQL", async () => {
    const orderRef = `R-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const purchase = await tokenRepository.creditShopierPurchase({
      userId, adminId, packageId: "tokens-10", orderRef, buyerEmail: `${userId}@example.test`,
    });
    assert.equal(purchase.status, "credited");
    if (purchase.status !== "credited") return;

    const [lot] = await sql<{ id: string }[]>`
      select id from token_purchase_lots where provider = 'shopier' and external_order_reference = ${orderRef}`;
    const insertRefund = (status: "pending_external_refund" | "external_refund_confirmed" | "cancelled", reference: string | null) =>
      sql`
        insert into token_refunds
          (id, user_id, purchase_lot_id, status, refund_amount_kurus, tokens_reversed, idempotency_key,
           external_refund_reference, created_by, confirmed_at)
        values
          (${`refund-${crypto.randomUUID()}`}, ${userId}, ${lot.id}, ${status}, 100, 1,
           ${`test-refund:${crypto.randomUUID()}`}, ${reference}, ${adminId},
           ${status === "external_refund_confirmed" ? new Date() : null})`;

    await assert.rejects(insertRefund("external_refund_confirmed", null), /token_refunds_external_reference_pair|check constraint/i);
    await assert.rejects(insertRefund("pending_external_refund", `SHOPIER-REFUND-${crypto.randomUUID()}`), /token_refunds_external_reference_pair|check constraint/i);
    await insertRefund("pending_external_refund", null);
    await insertRefund("external_refund_confirmed", `SHOPIER-REFUND-${crypto.randomUUID()}`);
    await insertRefund("cancelled", null);
  });
});
