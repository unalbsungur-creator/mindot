/**
 * Guarded production migration — current release: tombstone split
 * (0031_memory_project_message_nullable: memory_projects.message_id may be NULL).
 * Take and verify a Neon restore point first. Uses only an explicit direct
 * production URL; never reads .env.local, and never performs a Shopier refund.
 *
 * Release order: staging 0031 → staging verification → Neon backup branch →
 * production 0031 (this script) → PR merge (code deploy). The migration only
 * drops a NOT NULL, so the previous code keeps working on the migrated
 * database: migrate first, deploy after.
 * Only a known journal state (0024–0030) is accepted as the starting point;
 * an already-applied 0031 is accepted too, so a re-run is a no-op.
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

async function main(): Promise<void> {
const CONFIRMATION = "MINDOT-PRODUCTION-TOMBSTONE-0031";
const PRODUCTION_HOST_PREFIX = "ep-cool-art-b2nhe8o2";
const ALLOWED_LATEST = new Set([
  "1791809597974", "1791975595810", "1791989814430",
  "1792032000000", "1792032300000", "1792166400000",
  // 0029_quote_attribution (MB-01, applied 2026-11-08).
  "1794096000000",
  // 0030_moderation_alerts (applied 2026-11-09).
  "1794268800000",
  // 0031_memory_project_message_nullable — already applied: the migrator skips it.
  "1794873600000",
]);
const EXPECTED_LATEST = "1794873600000";
function fail(message: string): never { throw new Error(message); }
const urlText = process.env.PRODUCTION_DATABASE_URL?.trim();
if (!urlText) fail("Set PRODUCTION_DATABASE_URL in the shell; .env.local is never read.");
if (process.env.CONFIRM_PRODUCTION_MIGRATION !== CONFIRMATION) {
  fail(`Set CONFIRM_PRODUCTION_MIGRATION=${CONFIRMATION} only after taking a Neon restore point.`);
}
if (process.env.NEON_BACKUP_CONFIRMED !== "YES") {
  fail("Set NEON_BACKUP_CONFIRMED=YES after verifying a Neon restore point exists.");
}
let url: URL;
try { url = new URL(urlText); } catch { fail("PRODUCTION_DATABASE_URL is not a valid URL."); }
const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ""));
if (!["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.hostname.toLowerCase().startsWith(PRODUCTION_HOST_PREFIX) ||
    databaseName !== "neondb" || url.hostname.toLowerCase().includes("pooler") ||
    url.hostname.toLowerCase().includes("ep-little-shadow") ||
    url.hostname.toLowerCase().includes("ep-morning-hat")) {
  fail("Refusing target. Expected the verified direct production Neon host and database neondb; staging/pooler hosts are forbidden.");
}
const db = postgres(urlText, { max: 1, connect_timeout: 10, idle_timeout: 10, onnotice: () => {} });
async function walletLedgerViolations(client: ReturnType<typeof postgres>): Promise<number> {
  const [row] = await client`
    WITH ledger_totals AS (
      SELECT user_id, COALESCE(sum(amount), 0)::int AS ledger_balance
      FROM public.token_ledger GROUP BY user_id
    ), compared AS (
      SELECT COALESCE(w.user_id, l.user_id) AS user_id,
        COALESCE(w.balance, 0)::int AS wallet_balance,
        COALESCE(l.ledger_balance, 0)::int AS ledger_balance
      FROM public.token_wallets w FULL OUTER JOIN ledger_totals l ON l.user_id = w.user_id
    )
    SELECT count(*)::int AS violations FROM compared WHERE wallet_balance <> ledger_balance
  `;
  return row.violations as number;
}
try {
  const [identity] = await db`SELECT current_database() AS database_name, current_setting('server_version') AS server_version`;
  if (identity.database_name !== "neondb") fail("Connected database does not match neondb.");
  const [migrationTable] = await db`
    SELECT table_schema FROM information_schema.tables
    WHERE table_name = '__drizzle_migrations' AND table_schema NOT IN ('information_schema', 'pg_catalog')
    ORDER BY CASE WHEN table_schema = 'drizzle' THEN 0 ELSE 1 END LIMIT 1
  `;
  if (!migrationTable) fail("Drizzle migration journal not found; no migration was run.");
  const safeSchema = String(migrationTable.table_schema).replace(/"/g, '""');
  const [lastRow] = await db.unsafe(`SELECT max(created_at)::text AS latest FROM "${safeSchema}"."__drizzle_migrations"`);
  const latest = String(lastRow?.latest ?? "");
  if (!ALLOWED_LATEST.has(latest)) fail(`Unexpected migration state ${latest || "(empty)"}; no migration was run.`);
  const before = await walletLedgerViolations(db);
  if (before !== 0) fail(`Wallet/ledger invariant failed for ${before} account(s); no migration was run.`);
  const [counts] = await db`
    SELECT (SELECT count(*)::int FROM public.token_ledger) AS ledger_entries,
           (SELECT count(*)::int FROM public.token_wallets) AS wallets,
           (SELECT count(*)::int FROM public.memory_projects) AS memory_projects,
           (SELECT count(*)::int FROM public.messages) AS messages,
           (SELECT count(*)::int FROM public.users WHERE deleted_at IS NOT NULL) AS tombstones
  `;
  console.log(`Verified direct production target ${url.hostname}/${databaseName} (PostgreSQL ${identity.server_version}); ${counts.ledger_entries} ledger entries, ${counts.wallets} wallets reconcile.`);
  console.log(`Before: ${counts.memory_projects} memory projects, ${counts.messages} messages, ${counts.tombstones} deleted accounts.`);
  await migrate(drizzle(db), { migrationsFolder: "drizzle" });
  const after = await walletLedgerViolations(db);
  if (after !== 0) fail(`After migration, wallet/ledger invariant failed for ${after} account(s).`);
  const [verified] = await db.unsafe(`SELECT max(created_at)::text AS latest FROM "${safeSchema}"."__drizzle_migrations"`);
  if (String(verified?.latest ?? "") !== EXPECTED_LATEST) fail("Migrations returned without expected 0031 journal marker.");
  const [column] = await db`
    SELECT is_nullable FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'memory_projects' AND column_name = 'message_id'
  `;
  if (column?.is_nullable !== "YES") fail("memory_projects.message_id is still NOT NULL after the migration.");
  const [fk] = await db`
    SELECT count(*)::int AS n FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'memory_projects' AND constraint_type = 'FOREIGN KEY'
  `;
  const [after_] = await db`
    SELECT (SELECT count(*)::int FROM public.memory_projects) AS memory_projects,
           (SELECT count(*)::int FROM public.messages) AS messages,
           (SELECT count(*)::int FROM public.memory_projects WHERE message_id IS NULL) AS unlinked
  `;
  if (after_.memory_projects !== counts.memory_projects || after_.messages !== counts.messages) {
    fail("Row counts changed during the migration.");
  }
  if (after_.unlinked !== 0) fail(`Expected no memory project without a card link right after the migration, found ${after_.unlinked}.`);
  console.log(`Production migration complete: 0031 applied; memory_projects.message_id is nullable (${fk.n} foreign keys kept); ${after_.memory_projects} memory projects and ${after_.messages} messages untouched; balances reconcile.`);
} catch (error) {
  const safeMessage = error instanceof Error ? error.message.replaceAll(urlText, "[redacted connection string]") : "Unknown error";
  console.error(`Production migration failed: ${safeMessage}`);
  process.exitCode = 1;
} finally {
  await db.end({ timeout: 5 });
}


}

void main().catch((error: unknown) => {
  const secret = process.env.PRODUCTION_DATABASE_URL ?? "";
  const message = error instanceof Error ? error.message : "Unknown preflight error";
  console.error("[db:migrate:production] Preflight failed: " + message.replaceAll(secret, "[redacted connection string]"));
  process.exitCode = 1;
});
