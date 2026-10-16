import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  tokenPurchaseAllocations,
  tokenPurchaseLots,
  tokenRefunds,
} from "@/lib/db/schema";

const MIGRATION = readFileSync("drizzle/0026_token_refund_foundation.sql", "utf8");
const BACKFILL_MIGRATION = readFileSync("drizzle/0028_token_purchase_history_backfill.sql", "utf8");

describe("token refund schema foundation", () => {
  it("defines the purchase-lot table and protects order/ledger uniqueness", () => {
    const config = getTableConfig(tokenPurchaseLots);
    assert.equal(config.name, "token_purchase_lots");
    assert.ok(config.indexes.some((item) => item.config.name === "token_purchase_lots_provider_order_idx" && item.config.unique));
    assert.ok(config.columns.some((column) => column.name === "paid_amount_kurus"));
    assert.ok(config.columns.some((column) => column.name === "credited_ledger_entry_id" && column.isUnique));
  });

  it("requires purchase allocations to have a purchase lot and positive amount", () => {
    const config = getTableConfig(tokenPurchaseAllocations);
    assert.equal(config.name, "token_purchase_allocations");
    const checks = config.checks.map((item) => item.name);
    assert.ok(checks.includes("token_purchase_allocations_amount_positive"));
    assert.ok(checks.includes("token_purchase_allocations_purchase_has_lot"));
    assert.ok(checks.includes("token_purchase_allocations_nonpurchase_has_no_lot"));
  });

  it("records refund status, idempotency, and external confirmation", () => {
    const config = getTableConfig(tokenRefunds);
    assert.equal(config.name, "token_refunds");
    assert.ok(config.columns.some((column) => column.name === "idempotency_key" && column.isUnique));
    assert.ok(config.indexes.some((item) => item.config.name === "token_refunds_external_ref_idx" && item.config.unique));
    assert.ok(config.checks.some((item) => item.name === "token_refunds_confirmation_pair"));
  });

  it("contains an additive migration and does not rewrite the existing ledger", () => {
    for (const table of ["token_purchase_lots", "token_purchase_allocations", "token_refunds"]) {
      assert.match(MIGRATION, new RegExp(`CREATE TABLE "${table}"`));
    }
    assert.doesNotMatch(MIGRATION, /UPDATE\s+"?token_ledger"?|DELETE\s+FROM\s+"?token_ledger"?/i);
  });
  it("backfills verified Shopier purchases and allocations without rewriting the ledger", () => {
    assert.match(BACKFILL_MIGRATION, /INSERT INTO public\.token_purchase_lots/);
    assert.match(BACKFILL_MIGRATION, /WHEN 'tokens-10' THEN 1200/);
    assert.match(BACKFILL_MIGRATION, /WHEN 'tokens-50' THEN 5000/);
    assert.match(BACKFILL_MIGRATION, /WHEN 'tokens-100' THEN 8000/);
    assert.match(BACKFILL_MIGRATION, /INSERT INTO public\.token_purchase_allocations/);
    assert.match(BACKFILL_MIGRATION, /RAISE EXCEPTION/);
    assert.doesNotMatch(BACKFILL_MIGRATION, /UPDATE\s+public\.token_ledger|DELETE\s+FROM\s+public\.token_ledger/i);
  });

  it("requires an external reference exactly when a refund is confirmed", () => {
    const config = getTableConfig(tokenRefunds);
    assert.ok(config.checks.some((item) => item.name === "token_refunds_external_reference_pair"));

    const guardMigration = readFileSync("drizzle/0027_token_refund_reference_guard.sql", "utf8");
    assert.match(guardMigration, /token_refunds_external_reference_pair/);
    assert.match(
      guardMigration,
      /external_refund_confirmed[\s\S]*external_refund_reference[\s\S]*is not null/i
    );
    assert.doesNotMatch(guardMigration, /UPDATE\s+"?token_ledger"?|DELETE\s+FROM\s+"?token_ledger"?/i);
  });
});
