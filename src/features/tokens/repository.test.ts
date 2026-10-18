import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { memoryPdfUnlocks, tokenLedger, tokenWallets } from "@/lib/db/schema";
import {
  FIRST_SHARE_REWARD_AMOUNT,
  FIRST_SHARE_REWARD_REFERENCE_TYPE,
  MEMORY_PDF_UNLOCK_COST,
  adminGrantIdempotencyKey,
  firstShareRewardIdempotencyKey,
  memoryPdfUnlockIdempotencyKey,
  tokenRepository,
} from "./repository";
import {
  MAX_MANUAL_REVIEW_REASON_LENGTH,
  MAX_PURCHASE_NOTE_LENGTH,
  SHOPIER_PROVIDER,
  SHOPIER_PURCHASE_REFERENCE_TYPE,
  buildShopierPurchaseNote,
  cleanManualReviewReason,
  normalizeEmail,
  normalizeShopierOrderRef,
  shopierPurchaseIdempotencyKey,
} from "./lib/shopierPurchase";
import { MAX_ADMIN_GRANT_AMOUNT } from "./types";

// Database-free checks only. The transactional behaviour (row lock,
// conditional decrement, unique-violation fallback, balance == SUM(ledger))
// and the ledger guard triggers run against a disposable Postgres in
// repository.db.test.ts (npm run test:db:tokens).

// Line endings normalized: a Windows checkout with core.autocrlf=true turns
// the migrations' LF into CRLF, which the multi-line expectations below
// would otherwise never match. The SQL content itself is compared unchanged.
const readMigration = (path: string) => readFileSync(path, "utf-8").replace(/\r\n/g, "\n");
const MIGRATION = readMigration("drizzle/0016_graceful_king_cobra.sql");
const GUARD_MIGRATION = readMigration("drizzle/0022_token_ledger_append_only.sql");
const FIRST_SHARE_REWARD_MIGRATION = readMigration("drizzle/0023_first_share_reward.sql");

function constraintNames(table: PgTable) {
  const config = getTableConfig(table);
  return {
    checks: config.checks.map((check) => check.name),
    uniqueColumns: config.columns.filter((column) => column.isUnique).map((column) => column.name),
    indexes: config.indexes.map((index) => ({ name: index.config.name, unique: index.config.unique, where: !!index.config.where })),
  };
}

describe("token idempotency keys", () => {
  it("derives one consume key per memory project, so a project can only be charged once", () => {
    assert.equal(memoryPdfUnlockIdempotencyKey("project-1"), "memory_pdf_unlock:project-1");
    assert.equal(memoryPdfUnlockIdempotencyKey("project-1"), memoryPdfUnlockIdempotencyKey("project-1"));
    assert.notEqual(memoryPdfUnlockIdempotencyKey("project-1"), memoryPdfUnlockIdempotencyKey("project-2"));
  });

  it("namespaces admin grant keys by admin, so the same requestId from two admins never collides", () => {
    const requestId = "0b6c1c9e-2f6a-4c55-9d6e-7f1f4b9a0c11";
    assert.equal(adminGrantIdempotencyKey("admin-a", requestId), `admin_grant:admin-a:${requestId}`);
    assert.notEqual(adminGrantIdempotencyKey("admin-a", requestId), adminGrantIdempotencyKey("admin-b", requestId));
  });

  it("gives every first-share reward a fresh random key that names no account", () => {
    const keys = Array.from({ length: 50 }, () => firstShareRewardIdempotencyKey());
    assert.equal(new Set(keys).size, keys.length);
    for (const key of keys) {
      assert.match(key, /^first_share_reward:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
  });

  it("keeps grant and consume keys in separate namespaces", () => {
    assert.ok(!adminGrantIdempotencyKey("a", "b").startsWith("memory_pdf_unlock:"));
    assert.ok(!memoryPdfUnlockIdempotencyKey("a").startsWith("admin_grant:"));
  });
});

describe("token limits", () => {
  it("charges exactly one token per PDF unlock", () => {
    assert.equal(MEMORY_PDF_UNLOCK_COST, 1);
  });

  it("rewards a first share with exactly two tokens", () => {
    assert.equal(FIRST_SHARE_REWARD_AMOUNT, 2);
    assert.equal(FIRST_SHARE_REWARD_REFERENCE_TYPE, "first_share_reward");
  });

  it("caps a single admin grant at 1000", () => {
    assert.equal(MAX_ADMIN_GRANT_AMOUNT, 1000);
  });

  it("rejects a non-positive or non-integer grant before opening a database connection", async () => {
    for (const amount of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
      await assert.rejects(
        tokenRepository.grantByAdmin({ userId: "user-1", amount, adminId: "admin-1", idempotencyKey: "k", note: null }),
        RangeError,
        `amount ${amount}`
      );
    }
  });

  it("reports no first-share reward for an empty account id without opening a database connection", async () => {
    assert.equal(await tokenRepository.hasFirstShareReward(""), false);
  });
});

describe("Shopier purchase rules", () => {
  it("normalizes an order number to one canonical form, or refuses it", () => {
    assert.equal(normalizeShopierOrderRef(" ab-12 "), "AB-12");
    assert.equal(normalizeShopierOrderRef("123456789"), "123456789");
    assert.equal(normalizeShopierOrderRef("A".repeat(64)), "A".repeat(64));
    for (const value of [undefined, null, 42, "", "   ", "ab", "A".repeat(65), "12 34", "12_34", "12/34", "ŞİPARİŞ1", "12;drop", "1\n2"]) {
      assert.equal(normalizeShopierOrderRef(value), null, JSON.stringify(value));
    }
  });

  it("derives the idempotency key from the order alone — no account, no admin", () => {
    assert.equal(shopierPurchaseIdempotencyKey("AB-12"), "shopier_order:AB-12");
    assert.equal(SHOPIER_PROVIDER, "shopier");
    assert.equal(SHOPIER_PURCHASE_REFERENCE_TYPE, "shopier_order");
    for (const other of [memoryPdfUnlockIdempotencyKey("x"), adminGrantIdempotencyKey("a", "b"), firstShareRewardIdempotencyKey()]) {
      assert.ok(!other.startsWith("shopier_order:"), other);
    }
  });

  it("compares emails trimmed and case-insensitively, refusing anything that isn't one", () => {
    assert.equal(normalizeEmail("  Buyer@Example.COM "), "buyer@example.com");
    for (const value of [undefined, null, 1, "", "   ", "buyer", "@example.com", "buyer@", "a@b@c", "bu yer@example.com", `${"a".repeat(250)}@x.co`]) {
      assert.equal(normalizeEmail(value), null, JSON.stringify(value));
    }
  });

  it("treats a blank manual-review reason as none, and caps a long one", () => {
    for (const value of [undefined, null, "", "   \n"]) assert.equal(cleanManualReviewReason(value), null, JSON.stringify(value));
    assert.equal(cleanManualReviewReason("  checked by phone  "), "checked by phone");
    assert.equal(cleanManualReviewReason("x".repeat(1000))?.length, MAX_MANUAL_REVIEW_REASON_LENGTH);
  });

  it("writes how the account was matched into the note, never the buyer's email", () => {
    assert.equal(
      buildShopierPurchaseNote({ emailCheck: "matched", manualReviewReason: null, adminNote: null, redactEmails: ["buyer@example.com"] }),
      "email: matched"
    );
    const note = buildShopierPurchaseNote({
      emailCheck: "manual_review",
      manualReviewReason: "İletişimle doğrulandı: BUYER@example.com",
      adminNote: "  Sipariş buyer@EXAMPLE.com ile verildi  ",
      redactEmails: ["buyer@example.com", "owner@example.com"],
    });
    assert.equal(note, "email: manual review — İletişimle doğrulandı: [e-posta] | Sipariş [e-posta] ile verildi");
    assert.doesNotMatch(note.toLowerCase(), /buyer@example\.com/);
    // An email-like text that isn't one of the two addresses is the admin's own words, kept as written.
    assert.match(
      buildShopierPurchaseNote({ emailCheck: "matched", manualReviewReason: null, adminNote: "a.b+c@x.co", redactEmails: ["buyer@example.com"] }),
      /a\.b\+c@x\.co$/
    );
    const capped = buildShopierPurchaseNote({ emailCheck: "matched", manualReviewReason: null, adminNote: "n".repeat(2000), redactEmails: [] });
    assert.equal(capped.length, "email: matched | ".length + MAX_PURCHASE_NOTE_LENGTH);
  });

  it("refuses an unknown package, a bad order number or a bad email before opening a database connection", async () => {
    const base = { userId: "user-1", adminId: "admin-1", packageId: "tokens-50", orderRef: "AB-12", buyerEmail: "buyer@example.com" };
    assert.deepEqual(await tokenRepository.creditShopierPurchase({ ...base, packageId: "tokens-25" }), { status: "invalid_package" });
    assert.deepEqual(await tokenRepository.creditShopierPurchase({ ...base, packageId: "TOKENS-50" }), { status: "invalid_package" });
    assert.deepEqual(await tokenRepository.creditShopierPurchase({ ...base, orderRef: "  " }), { status: "invalid_order" });
    assert.deepEqual(await tokenRepository.creditShopierPurchase({ ...base, buyerEmail: "not-an-email" }), { status: "invalid_email" });
  });
});

describe("token schema backstops", () => {
  it("keeps the wallet balance non-negative", () => {
    assert.deepEqual(constraintNames(tokenWallets).checks, ["token_wallets_balance_non_negative"]);
  });

  it("makes every ledger movement unique by idempotency key and by provider transaction", () => {
    const ledger = constraintNames(tokenLedger);
    assert.deepEqual(ledger.checks.sort(), ["token_ledger_amount_non_zero", "token_ledger_balance_after_non_negative"]);
    assert.deepEqual(ledger.uniqueColumns, ["idempotency_key"]);
    assert.deepEqual(
      ledger.indexes.find((index) => index.name === "token_ledger_external_ref_idx"),
      { name: "token_ledger_external_ref_idx", unique: true, where: true }
    );
  });

  it("allows at most one first-share reward entry per account, in the schema and in migration 0023", () => {
    assert.deepEqual(
      constraintNames(tokenLedger).indexes.find((index) => index.name === "token_ledger_first_share_reward_idx"),
      { name: "token_ledger_first_share_reward_idx", unique: true, where: true }
    );
    // Index only: no table, column, enum or trigger change, and 0022 is left as it was.
    assert.equal(
      FIRST_SHARE_REWARD_MIGRATION.trim(),
      `CREATE UNIQUE INDEX "token_ledger_first_share_reward_idx" ON "token_ledger" USING btree ("user_id") WHERE "token_ledger"."reference_type" = 'first_share_reward';`
    );
  });

  it("allows one unlock per project, one unlock per ledger entry, and a ledger entry for every token unlock", () => {
    const unlocks = constraintNames(memoryPdfUnlocks);
    assert.deepEqual(unlocks.uniqueColumns.sort(), ["ledger_entry_id", "memory_project_id"]);
    assert.deepEqual(unlocks.checks, ["memory_pdf_unlocks_token_has_ledger_entry"]);
  });

  it("ships the same constraints in migration 0016", () => {
    for (const expected of [
      `CONSTRAINT "token_wallets_balance_non_negative" CHECK ("token_wallets"."balance" >= 0)`,
      `CONSTRAINT "token_ledger_idempotency_key_unique" UNIQUE("idempotency_key")`,
      `CONSTRAINT "token_ledger_amount_non_zero" CHECK ("token_ledger"."amount" <> 0)`,
      `CONSTRAINT "token_ledger_balance_after_non_negative" CHECK ("token_ledger"."balance_after" >= 0)`,
      `CONSTRAINT "memory_pdf_unlocks_memory_project_id_unique" UNIQUE("memory_project_id")`,
      `CONSTRAINT "memory_pdf_unlocks_ledger_entry_id_unique" UNIQUE("ledger_entry_id")`,
      `CREATE UNIQUE INDEX "token_ledger_external_ref_idx"`,
    ]) {
      assert.ok(MIGRATION.includes(expected), expected);
    }
  });

  it("guards the ledger against UPDATE/DELETE/TRUNCATE with triggers in migration 0022", () => {
    const statements = GUARD_MIGRATION.split("--> statement-breakpoint").map((statement) => statement.trim());
    assert.match(statements[0], /CREATE OR REPLACE FUNCTION "public"\."token_ledger_guard"\(\) RETURNS trigger[\s\S]*\$\$;$/);
    assert.ok(
      statements.includes(
        `CREATE TRIGGER "token_ledger_guard_row" BEFORE UPDATE OR DELETE ON "public"."token_ledger" FOR EACH ROW EXECUTE FUNCTION "public"."token_ledger_guard"();`
      )
    );
    assert.ok(
      statements.includes(
        `CREATE TRIGGER "token_ledger_guard_truncate" BEFORE TRUNCATE ON "public"."token_ledger" FOR EACH STATEMENT EXECUTE FUNCTION "public"."token_ledger_guard"();`
      )
    );
    // The account-deletion exception: tombstones only by INSERT, and the move re-checked at COMMIT.
    assert.ok(
      statements.includes(
        `CREATE TRIGGER "users_tombstone_guard_row" BEFORE UPDATE ON "public"."users" FOR EACH ROW\n  WHEN (OLD.deleted_at IS NOT NULL OR NEW.deleted_at IS NOT NULL)\n  EXECUTE FUNCTION "public"."users_tombstone_guard"();`
      )
    );
    assert.ok(
      statements.includes(
        `CREATE CONSTRAINT TRIGGER "token_ledger_repoint_deferred" AFTER UPDATE ON "public"."token_ledger"\n  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW\n  WHEN (OLD.user_id IS DISTINCT FROM NEW.user_id OR OLD.created_by IS DISTINCT FROM NEW.created_by)\n  EXECUTE FUNCTION "public"."token_ledger_repoint_check"();`
      )
    );
    // Re-runnable by hand: each CREATE TRIGGER is preceded by its DROP TRIGGER IF EXISTS.
    const created = statements.filter((statement) => /^CREATE (CONSTRAINT )?TRIGGER/.test(statement));
    const dropped = statements.filter((statement) => statement.startsWith("DROP TRIGGER IF EXISTS"));
    assert.equal(created.length, 4);
    assert.equal(dropped.length, created.length);
    for (const statement of created) {
      const index = statements.indexOf(statement);
      const name = /TRIGGER ("[a-z_]+")/.exec(statement)![1];
      assert.ok(statements[index - 1].startsWith(`DROP TRIGGER IF EXISTS ${name}`), name);
    }
    // Only the guard's one exception (account deletion's tombstone re-pointing) may update a row.
    assert.match(GUARD_MIGRATION, /\(to_jsonb\(NEW\) - 'user_id' - 'created_by'\) IS DISTINCT FROM \(to_jsonb\(OLD\) - 'user_id' - 'created_by'\)/);
    // The table itself (0016) carries no trigger, REVOKE, or GRANT.
    assert.doesNotMatch(MIGRATION, /CREATE (OR REPLACE )?(TRIGGER|FUNCTION)|REVOKE/i);
  });
});
