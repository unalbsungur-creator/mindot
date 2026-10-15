import assert from "node:assert/strict";
import { after, before, describe, it, mock } from "node:test";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { tokenRepository } from "./repository";

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

describe("createTokenRefund on PostgreSQL", { skip: TEST_URL ? false : "TOKEN_TEST_DATABASE_URL is not set" }, () => {
  let sql: ReturnType<typeof postgres>;
  let adminId: string;
  let userId: string;
  let purchaseLotId: string;
  let createTokenRefund: typeof import("./refund-actions").createTokenRefund;

  before(async () => {
    delete process.env.APP_ENV;
    process.env.DATABASE_URL = TEST_URL!;
    sql = postgres(TEST_URL!, { max: 5, onnotice: () => {} });
    await migrate(drizzle(sql), { migrationsFolder: "drizzle" });

    adminId = `test-admin-${crypto.randomUUID()}`;
    userId = `test-user-${crypto.randomUUID()}`;
    await sql`insert into users (id, email, role) values
      (${adminId}, ${`${adminId}@example.test`}, 'admin'),
      (${userId}, ${`${userId}@example.test`}, 'user')`;

    mock.module("next/cache", { namedExports: { revalidatePath: () => {} } });
    mock.module("@/features/auth/requireAdmin", {
      namedExports: { requireAdmin: async () => ({ id: adminId, role: "admin" }) },
    });
    ({ createTokenRefund } = await import("./refund-actions"));

    const orderRef = `RF-${crypto.randomUUID().toUpperCase()}`;
    const purchase = await tokenRepository.creditShopierPurchase({
      userId,
      adminId,
      packageId: "tokens-10",
      orderRef,
      buyerEmail: `${userId}@example.test`,
    });
    assert.equal(purchase.status, "credited");
    const [lot] = await sql<{ id: string }[]>`
      select id from token_purchase_lots
      where provider = 'shopier' and external_order_reference = ${orderRef}`;
    assert.ok(lot, "the fixture purchase lot must exist");
    purchaseLotId = lot.id;
  });

  after(async () => {
    await sql?.end({ timeout: 5 });
  });

  it("returns idempotent success for concurrent identical requests and debits exactly once", async () => {
    const requestId = crypto.randomUUID();
    const input = {
      purchaseLotId,
      refundAmountKurus: 100,
      tokensReversed: 1,
      requestId,
    };

    const results = await Promise.all(
      Array.from({ length: 12 }, () => createTokenRefund(input))
    );

    assert.deepEqual(results, Array.from({ length: 12 }, () => ({ ok: true })));

    const idempotencyKey = `token_refund_reserve:${requestId}`;
    const [rows] = await sql<{ refunds: number; reservedEntries: number }[]>`
      select
        (select count(*)::int from token_refunds where idempotency_key = ${idempotencyKey}) as refunds,
        (select count(*)::int from token_ledger where idempotency_key = ${`${idempotencyKey}:reserve`}) as "reservedEntries"`;
    assert.deepEqual(rows, { refunds: 1, reservedEntries: 1 });

    const [wallet] = await sql<{ balance: number; ledgerTotal: number }[]>`
      select
        (select balance from token_wallets where user_id = ${userId}) as balance,
        (select coalesce(sum(amount), 0)::int from token_ledger where user_id = ${userId}) as "ledgerTotal"`;
    assert.equal(wallet.balance, 9, "only one Token is reserved from the 10-Token purchase");
    assert.equal(wallet.ledgerTotal, 9, "wallet projection equals the append-only ledger sum");

    const conflictingReplay = await createTokenRefund({ ...input, refundAmountKurus: 101 });
    assert.deepEqual(conflictingReplay, { ok: false, error: "idempotency_conflict" });

    const [afterConflict] = await sql<{ refunds: number; balance: number }[]>`
      select
        (select count(*)::int from token_refunds where idempotency_key = ${idempotencyKey}) as refunds,
        (select balance from token_wallets where user_id = ${userId}) as balance`;
    assert.deepEqual(afterConflict, { refunds: 1, balance: 9 }, "conflicting reuse must not mutate the wallet or refund history");
  });
});
