import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { memoryPdfUnlocks, tokenLedger, tokenWallets } from "@/lib/db/schema";
import {
  MEMORY_PDF_UNLOCK_COST,
  adminGrantIdempotencyKey,
  memoryPdfUnlockIdempotencyKey,
  tokenRepository,
} from "./repository";
import { MAX_ADMIN_GRANT_AMOUNT } from "./types";

// Database-free checks only. The transactional behaviour (row lock,
// conditional decrement, unique-violation fallback, balance == SUM(ledger))
// and the ledger guard triggers run against a disposable Postgres in
// repository.db.test.ts (npm run test:db:tokens).

const MIGRATION = readFileSync("drizzle/0016_graceful_king_cobra.sql", "utf-8");
const GUARD_MIGRATION = readFileSync("drizzle/0022_token_ledger_append_only.sql", "utf-8");

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

  it("keeps grant and consume keys in separate namespaces", () => {
    assert.ok(!adminGrantIdempotencyKey("a", "b").startsWith("memory_pdf_unlock:"));
    assert.ok(!memoryPdfUnlockIdempotencyKey("a").startsWith("admin_grant:"));
  });
});

describe("token limits", () => {
  it("charges exactly one token per PDF unlock", () => {
    assert.equal(MEMORY_PDF_UNLOCK_COST, 1);
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
