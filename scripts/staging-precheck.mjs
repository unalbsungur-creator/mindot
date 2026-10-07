/**
 * Read-only pre-migration check for a NEW, EMPTY staging database.
 *
 *   node scripts/staging-precheck.mjs
 *
 * Connects only to STAGING_DATABASE_URL from the shell — never DATABASE_URL
 * or any other variable, and refuses the local development DATABASE_URL
 * (same rule as `npm run db:migrate:staging`). Never prints the URL, host,
 * user or password.
 *
 * Read-only by construction: the session is opened with
 * default_transaction_read_only=on and every query runs inside a
 * `BEGIN READ ONLY` transaction, so Postgres itself rejects any write.
 * Only catalog queries (to_regclass / information_schema / pg_catalog) run.
 *
 * Expected on a fresh staging database, before any migration:
 *   __drizzle_migrations: ABSENT, apple_sign_in_tokens: ABSENT,
 *   production migration/schema traces: ABSENT  → PASS, exit 0.
 * Anything else → FAIL, exit 1. Bad/missing URL or connection error → exit 2.
 */
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import postgres from "postgres";

// The MINDOT schema as of migration 0021 (drizzle/meta/0021_snapshot.json).
// Any of these in the target means it already holds MINDOT data — either a
// previously-migrated database or a copy/branch of production.
const MINDOT_TABLES = [
  "apple_sign_in_tokens",
  "digital_access_codes",
  "invitations",
  "memory_pdf_unlocks",
  "memory_projects",
  "message_likes",
  "message_reports",
  "messages",
  "mobile_sessions",
  "notifications",
  "physical_orders",
  "token_ledger",
  "token_wallets",
  "user_blocks",
  "users",
];
const MINDOT_ENUMS = [
  "ai_moderation_decision",
  "apple_token_client",
  "digital_access_code_status",
  "invitation_email_status",
  "invitation_status",
  "memory_capture_mode",
  "memory_output_type",
  "memory_pdf_unlock_source",
  "memory_project_status",
  "message_report_reason",
  "message_report_status",
  "message_status",
  "mobile_platform",
  "notification_type",
  "physical_order_status",
  "token_ledger_type",
  "user_account_status",
  "user_role",
];
const MINDOT_SEQUENCES = ["message_placement_seq"];

function fail(message, code) {
  console.error(`[staging-precheck] ${message}`);
  process.exit(code);
}

// 1. Validate the URL before connecting — without ever echoing it.
const url = process.env.STAGING_DATABASE_URL?.trim();
if (!url) fail("STAGING_DATABASE_URL is not set (or empty) in this shell. No other variable is used.", 2);

let parsed;
try {
  parsed = new URL(url);
} catch {
  fail("STAGING_DATABASE_URL is not a valid URL.", 2);
}
if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
  fail("STAGING_DATABASE_URL must start with postgres:// or postgresql://.", 2);
}
if (!parsed.hostname) fail("STAGING_DATABASE_URL has no host.", 2);
if (!parsed.pathname || parsed.pathname === "/") fail("STAGING_DATABASE_URL names no database.", 2);

let localUrl;
try {
  localUrl = parseEnv(readFileSync(".env.local", "utf-8")).DATABASE_URL?.trim();
} catch {
  // No .env.local — nothing to compare against.
}
if (localUrl && localUrl === url) fail("STAGING_DATABASE_URL is the local development DATABASE_URL — refusing.", 2);

// 2. Catalog-only checks inside a read-only session + transaction.
const sql = postgres(url, {
  max: 1,
  onnotice: () => {},
  connection: { default_transaction_read_only: "on", application_name: "mindot-staging-precheck" },
});

let report;
try {
  report = await sql.begin("read only", async (tx) => {
    const [{ readOnly }] = await tx`SELECT current_setting('transaction_read_only') AS "readOnly"`;

    const [{ migrationsTable }] = await tx`
      SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL
          OR to_regclass('public.__drizzle_migrations') IS NOT NULL AS "migrationsTable"`;
    const [{ drizzleSchema }] = await tx`
      SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'drizzle') AS "drizzleSchema"`;

    const [{ appleTable }] = await tx`SELECT to_regclass('public.apple_sign_in_tokens') IS NOT NULL AS "appleTable"`;
    const applePk = appleTable
      ? (
          await tx`
            SELECT constraint_name FROM information_schema.table_constraints
            WHERE table_schema = 'public' AND table_name = 'apple_sign_in_tokens' AND constraint_type = 'PRIMARY KEY'`
        ).map((row) => row.constraint_name)
      : [];

    const tables = (
      await tx`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name IN ${tx(MINDOT_TABLES)}`
    ).map((row) => row.table_name);
    const enums = (
      await tx`
        SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public' AND t.typtype = 'e' AND t.typname IN ${tx(MINDOT_ENUMS)}`
    ).map((row) => row.typname);
    const sequences = (
      await tx`
        SELECT sequence_name FROM information_schema.sequences
        WHERE sequence_schema = 'public' AND sequence_name IN ${tx(MINDOT_SEQUENCES)}`
    ).map((row) => row.sequence_name);
    const [{ otherTables }] = await tx`
      SELECT count(*)::int AS "otherTables" FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name NOT IN ${tx(MINDOT_TABLES)}`;

    return { readOnly, migrationsTable, drizzleSchema, appleTable, applePk, tables, enums, sequences, otherTables };
  });
} catch (error) {
  // The driver's message can include the host; print only the error class/code.
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  fail(`Connection or query failed (${error instanceof Error ? error.name : "unknown"}${code ? ` ${code}` : ""}).`, 2);
} finally {
  await sql.end({ timeout: 5 });
}

// 3. Report.
const state = (present) => (present ? "PRESENT" : "ABSENT");
const productionTraces = report.drizzleSchema || report.tables.length > 0 || report.enums.length > 0 || report.sequences.length > 0;

console.log(`transaction_read_only:            ${report.readOnly}`);
console.log(`__drizzle_migrations:             ${state(report.migrationsTable)}`);
console.log(
  `apple_sign_in_tokens:             ${state(report.appleTable)}` +
    (report.appleTable ? ` (primary key: ${report.applePk.join(", ") || "none"})` : "")
);
console.log(`production migration/schema trace: ${state(productionTraces)}`);
if (productionTraces) {
  if (report.drizzleSchema) console.log("  - schema: drizzle");
  if (report.tables.length) console.log(`  - tables: ${report.tables.join(", ")}`);
  if (report.enums.length) console.log(`  - enums: ${report.enums.join(", ")}`);
  if (report.sequences.length) console.log(`  - sequences: ${report.sequences.join(", ")}`);
}
console.log(`other tables in public:           ${report.otherTables}`);

const pass =
  report.readOnly === "on" && !report.migrationsTable && !report.appleTable && !productionTraces && report.otherTables === 0;
console.log(pass ? "PASS — empty database, ready for `npm run db:migrate:staging`." : "FAIL — not an empty staging database. Do not migrate.");
process.exit(pass ? 0 : 1);
