/**
 * Read-only post-migration check for the staging database.
 *
 *   node scripts/staging-postmigration-check.mjs     (from the repository root)
 *
 * Connects only to STAGING_DATABASE_URL from the shell — never DATABASE_URL
 * or any other variable — and refuses the local development DATABASE_URL.
 * Never prints the URL, host, user or password.
 *
 * Read-only by construction: the session is opened with
 * default_transaction_read_only=on and everything runs inside one
 * `BEGIN READ ONLY` transaction — catalog queries plus `count(*)` only.
 *
 * Expectations are read from the repository, not hand-copied:
 * drizzle/meta/_journal.json (which migrations, in which order),
 * drizzle/<tag>.sql (each migration's hash, the way drizzle-orm computes it)
 * and drizzle/meta/<latest>_snapshot.json (tables, columns, enums).
 *
 * Exit codes: 0 PASS · 1 schema/data verification failure · 2 environment/connection failure.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import postgres from "postgres";

function exitWith(message, code) {
  console.error(`[staging-postmigration-check] ${message}`);
  process.exit(code);
}

// ---------------------------------------------------------------------------
// 1. Expectations from the repository.
// ---------------------------------------------------------------------------
let journal;
let snapshot;
let migrationFiles;
try {
  journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf-8"));
  const latest = journal.entries.at(-1);
  snapshot = JSON.parse(readFileSync(`drizzle/meta/${String(latest.idx).padStart(4, "0")}_snapshot.json`, "utf-8"));
  migrationFiles = journal.entries.map((entry) => ({
    ...entry,
    content: readFileSync(`drizzle/${entry.tag}.sql`, "utf-8"),
  }));
} catch {
  exitWith("Run this from the repository root (drizzle/meta/_journal.json and the migration files must be readable).", 2);
}

const EXPECTED_LATEST_TAG = "0021_nappy_jack_flag";
const EXPECTED_MIGRATION_COUNT = 22;
if (journal.entries.length !== EXPECTED_MIGRATION_COUNT || journal.entries.at(-1).tag !== EXPECTED_LATEST_TAG) {
  exitWith(
    `This checkout's journal is not 0000–0021 (${journal.entries.length} entries, latest ${journal.entries.at(-1).tag}); ` +
      "run the check from the commit that was migrated.",
    2
  );
}

// drizzle-orm stores sha256(file contents). The same file can have LF or CRLF
// line endings depending on the checkout it was migrated from, so accept either.
const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const acceptedHashes = (content) => {
  const lf = content.replace(/\r\n/g, "\n");
  return new Set([sha256(content), sha256(lf), sha256(lf.replace(/\n/g, "\r\n"))]);
};

const snapshotTables = Object.values(snapshot.tables);
const EXPECTED_TABLES = snapshotTables.map((table) => table.name).sort();
const snapshotTable = (name) => snapshotTables.find((table) => table.name === name);
const enumValues = (name) => snapshot.enums[`public.${name}`]?.values;

// ---------------------------------------------------------------------------
// 2. Validate the URL before connecting — without ever echoing it.
// ---------------------------------------------------------------------------
const url = process.env.STAGING_DATABASE_URL?.trim();
if (!url) exitWith("STAGING_DATABASE_URL is not set (or empty) in this shell. No other variable is used.", 2);

let parsed;
try {
  parsed = new URL(url);
} catch {
  exitWith("STAGING_DATABASE_URL is not a valid URL.", 2);
}
if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
  exitWith("STAGING_DATABASE_URL must start with postgres:// or postgresql://.", 2);
}
if (!parsed.hostname) exitWith("STAGING_DATABASE_URL has no host.", 2);
if (!parsed.pathname || parsed.pathname === "/") exitWith("STAGING_DATABASE_URL names no database.", 2);

let localUrl;
try {
  localUrl = parseEnv(readFileSync(".env.local", "utf-8")).DATABASE_URL?.trim();
} catch {
  // No .env.local — nothing to compare against.
}
if (localUrl && localUrl === url) exitWith("STAGING_DATABASE_URL is the local development DATABASE_URL — refusing.", 2);

// ---------------------------------------------------------------------------
// 3. Read everything inside one read-only transaction.
// ---------------------------------------------------------------------------
const sql = postgres(url, {
  max: 1,
  onnotice: () => {},
  connection: { default_transaction_read_only: "on", application_name: "mindot-staging-postmigration-check" },
});

async function readColumns(tx, table) {
  return tx`
    SELECT column_name, data_type, udt_name, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${table}
    ORDER BY ordinal_position`;
}

// Every constraint on a table with its columns in key order.
async function readConstraints(tx, table) {
  return tx`
    SELECT c.conname, c.contype, c.confdeltype, c.confupdtype,
           c.confrelid::regclass::text AS referenced_table,
           ARRAY(SELECT a.attname FROM unnest(c.conkey) WITH ORDINALITY k(attnum, ord)
                 JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum ORDER BY k.ord)::text[] AS columns,
           ARRAY(SELECT a.attname FROM unnest(c.confkey) WITH ORDINALITY k(attnum, ord)
                 JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.attnum ORDER BY k.ord)::text[] AS referenced_columns
    FROM pg_constraint c
    WHERE c.conrelid = to_regclass(${`public.${table}`})`;
}

let db;
try {
  db = await sql.begin("read only", async (tx) => {
    const [{ readOnly }] = await tx`SELECT current_setting('transaction_read_only') AS "readOnly"`;
    const [{ drizzleSchema }] = await tx`SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'drizzle') AS "drizzleSchema"`;
    const [{ migrationsTable }] = await tx`SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS "migrationsTable"`;
    const migrations = migrationsTable
      ? await tx`SELECT hash, created_at::text AS created_at FROM drizzle.__drizzle_migrations ORDER BY created_at, id`
      : [];

    const enums = await tx`
      SELECT t.typname, array_agg(e.enumlabel ORDER BY e.enumsortorder)::text[] AS values
      FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE n.nspname = 'public' AND t.typname IN ('apple_token_client', 'mobile_platform')
      GROUP BY t.typname`;

    const publicTables = (
      await tx`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
    ).map((row) => row.table_name);

    const appleColumns = await readColumns(tx, "apple_sign_in_tokens");
    const appleConstraints = await readConstraints(tx, "apple_sign_in_tokens");
    const mobileColumns = await readColumns(tx, "mobile_sessions");
    const mobileConstraints = await readConstraints(tx, "mobile_sessions");
    const [mobileIndex] = await tx`
      SELECT am.amname AS method, ix.indisunique AS is_unique,
             ARRAY(SELECT a.attname FROM unnest(ix.indkey) WITH ORDINALITY k(attnum, ord)
                   JOIN pg_attribute a ON a.attrelid = ix.indrelid AND a.attnum = k.attnum ORDER BY k.ord)::text[] AS columns,
             ix.indrelid::regclass::text AS table_name
      FROM pg_index ix
      JOIN pg_class i ON i.oid = ix.indexrelid
      JOIN pg_namespace n ON n.oid = i.relnamespace
      JOIN pg_am am ON am.oid = i.relam
      WHERE n.nspname = 'public' AND i.relname = 'mobile_sessions_user_idx'`;

    // Row counts for every expected application table that exists (identifiers
    // come from the committed snapshot, never from input).
    const rowCounts = {};
    for (const table of EXPECTED_TABLES) {
      if (!publicTables.includes(table)) continue;
      const [{ count }] = await tx`SELECT count(*)::bigint::text AS count FROM ${tx("public." + table)}`;
      rowCounts[table] = Number(count);
    }

    return {
      readOnly,
      drizzleSchema,
      migrationsTable,
      migrations,
      enums,
      publicTables,
      appleColumns,
      appleConstraints,
      mobileColumns,
      mobileConstraints,
      mobileIndex,
      rowCounts,
    };
  });
} catch (error) {
  // The driver's message can include the host; print only the error class/code.
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  exitWith(`Connection or query failed (${error instanceof Error ? error.name : "unknown"}${code ? ` ${code}` : ""}).`, 2);
} finally {
  await sql.end({ timeout: 5 });
}

// ---------------------------------------------------------------------------
// 4. Evaluate.
// ---------------------------------------------------------------------------
const failures = [];
const results = [];
function check(label, problems) {
  const list = problems.filter(Boolean);
  results.push(`${label}: ${list.length === 0 ? "PASS" : "FAIL"}`);
  for (const problem of list) failures.push(`${label} — ${problem}`);
}
const sameList = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// Columns vs. the committed snapshot: name, type, NOT NULL, presence of a default.
function columnProblems(table, actualColumns) {
  const expected = snapshotTable(table);
  if (!expected) return [`${table} is missing from the snapshot`];
  if (actualColumns.length === 0) return [`table ${table} does not exist`];
  const problems = [];
  const actualByName = new Map(actualColumns.map((column) => [column.column_name, column]));
  for (const column of Object.values(expected.columns)) {
    const actual = actualByName.get(column.name);
    if (!actual) {
      problems.push(`column ${column.name} missing`);
      continue;
    }
    const actualType = column.typeSchema ? actual.udt_name : actual.data_type;
    if (actualType !== column.type) problems.push(`column ${column.name} has type ${actualType}, expected ${column.type}`);
    if ((actual.is_nullable === "NO") !== column.notNull) {
      problems.push(`column ${column.name} is ${actual.is_nullable === "NO" ? "NOT NULL" : "nullable"}, expected ${column.notNull ? "NOT NULL" : "nullable"}`);
    }
    if ((actual.column_default !== null) !== (column.default !== undefined)) {
      problems.push(`column ${column.name} default is ${actual.column_default ?? "none"}, expected ${column.default ?? "none"}`);
    }
  }
  for (const name of actualByName.keys()) {
    if (!expected.columns[name]) problems.push(`unexpected column ${name}`);
  }
  return problems;
}
const constraint = (list, name) => list.find((row) => row.conname === name);

// G) read-only
check("read-only transaction", [db.readOnly !== "on" && `transaction_read_only is ${db.readOnly}, expected on`]);

// A/E) migration history
const expectedByMillis = new Map(migrationFiles.map((file) => [String(file.when), file]));
const appliedTags = db.migrations.map((row) => expectedByMillis.get(row.created_at)?.tag ?? `(unknown created_at ${row.created_at})`);
const latestTag = appliedTags.at(-1) ?? "(none)";
check("migration metadata", [
  !db.drizzleSchema && "schema drizzle missing",
  !db.migrationsTable && "drizzle.__drizzle_migrations missing",
  db.migrations.length !== EXPECTED_MIGRATION_COUNT && `${db.migrations.length} migration rows, expected ${EXPECTED_MIGRATION_COUNT}`,
]);
check("migration history", [
  ...migrationFiles
    .filter((file) => !db.migrations.some((row) => row.created_at === String(file.when)))
    .map((file) => `missing ${file.tag}`),
  ...db.migrations
    .filter((row) => !expectedByMillis.has(row.created_at))
    .map((row) => `unexpected migration row (created_at ${row.created_at})`),
  ...db.migrations
    .filter((row) => expectedByMillis.has(row.created_at) && !acceptedHashes(expectedByMillis.get(row.created_at).content).has(row.hash))
    .map((row) => `${expectedByMillis.get(row.created_at).tag} was applied from different SQL than this checkout's file`),
  !sameList(appliedTags, migrationFiles.map((file) => file.tag)) && "applied order differs from the journal",
  latestTag !== EXPECTED_LATEST_TAG && `latest migration is ${latestTag}, expected ${EXPECTED_LATEST_TAG}`,
]);

// B) enums
const enumByName = new Map(db.enums.map((row) => [row.typname, row.values]));
check("apple_token_client enum", [
  !enumByName.has("apple_token_client") && "missing",
  enumByName.has("apple_token_client") &&
    !sameList(enumByName.get("apple_token_client"), enumValues("apple_token_client")) &&
    `values ${enumByName.get("apple_token_client")}, expected ${enumValues("apple_token_client")}`,
]);
check("mobile_platform enum", [
  !enumByName.has("mobile_platform") && "missing",
  enumByName.has("mobile_platform") &&
    !sameList(enumByName.get("mobile_platform"), enumValues("mobile_platform")) &&
    `values ${enumByName.get("mobile_platform")}, expected ${enumValues("mobile_platform")}`,
]);

// C) Apple token table
const appleClient = db.appleColumns.find((column) => column.column_name === "client");
check("apple_sign_in_tokens columns", [
  ...columnProblems("apple_sign_in_tokens", db.appleColumns),
  appleClient && appleClient.udt_name !== "apple_token_client" && `client type is ${appleClient.udt_name}`,
  appleClient && !/^'web'::/.test(appleClient.column_default ?? "") && `client default is ${appleClient.column_default ?? "none"}, expected 'web'`,
]);
const applePks = db.appleConstraints.filter((row) => row.contype === "p");
const applePk = constraint(db.appleConstraints, "apple_sign_in_tokens_user_id_client_pk");
const appleFk = constraint(db.appleConstraints, "apple_sign_in_tokens_user_id_users_id_fk");
check("apple composite PK", [
  !applePk && `primary key apple_sign_in_tokens_user_id_client_pk missing (found: ${applePks.map((row) => row.conname).join(", ") || "none"})`,
  applePk && applePk.contype !== "p" && "apple_sign_in_tokens_user_id_client_pk is not a primary key",
  applePk && !sameList(applePk.columns, ["user_id", "client"]) && `PK columns ${applePk.columns}, expected user_id,client`,
  constraint(db.appleConstraints, "apple_sign_in_tokens_pkey") && "old apple_sign_in_tokens_pkey still present",
]);
check("apple_sign_in_tokens FK", [
  !appleFk && "apple_sign_in_tokens_user_id_users_id_fk missing",
  appleFk && (appleFk.referenced_table !== "users" || !sameList(appleFk.referenced_columns, ["id"])) && "does not reference users.id",
]);

// B) mobile_sessions
const mobilePk = db.mobileConstraints.find((row) => row.contype === "p");
check("mobile_sessions", [
  ...columnProblems("mobile_sessions", db.mobileColumns),
  !mobilePk && "no primary key",
  mobilePk && !sameList(mobilePk.columns, ["id"]) && `primary key columns ${mobilePk.columns}, expected id`,
]);

// D) FK, no cascade
const mobileFk = constraint(db.mobileConstraints, "mobile_sessions_user_id_users_id_fk");
check("mobile_sessions FK", [
  !mobileFk && "mobile_sessions_user_id_users_id_fk missing",
  mobileFk && mobileFk.contype !== "f" && "not a foreign key",
  mobileFk && (mobileFk.referenced_table !== "users" || !sameList(mobileFk.referenced_columns, ["id"]) || !sameList(mobileFk.columns, ["user_id"])) &&
    "does not map user_id → users.id",
  mobileFk && mobileFk.confdeltype === "c" && "ON DELETE CASCADE present (must not be)",
  mobileFk && mobileFk.confdeltype !== "a" && mobileFk.confdeltype !== "c" && `ON DELETE action '${mobileFk.confdeltype}', expected no action`,
  mobileFk && mobileFk.confupdtype !== "a" && `ON UPDATE action '${mobileFk.confupdtype}', expected no action`,
]);

const refreshUnique = constraint(db.mobileConstraints, "mobile_sessions_refresh_token_hash_unique");
check("mobile_sessions unique refresh hash", [
  !refreshUnique && "mobile_sessions_refresh_token_hash_unique missing",
  refreshUnique && refreshUnique.contype !== "u" && "not a UNIQUE constraint",
  refreshUnique && !sameList(refreshUnique.columns, ["refresh_token_hash"]) && `columns ${refreshUnique.columns}`,
]);

check("mobile_sessions_user_idx", [
  !db.mobileIndex && "missing",
  db.mobileIndex && db.mobileIndex.table_name !== "mobile_sessions" && `on ${db.mobileIndex.table_name}`,
  db.mobileIndex && !sameList(db.mobileIndex.columns, ["user_id"]) && `columns ${db.mobileIndex.columns}`,
  db.mobileIndex && db.mobileIndex.method !== "btree" && `method ${db.mobileIndex.method}`,
  db.mobileIndex && db.mobileIndex.is_unique && "unexpectedly unique",
]);

// F) tables + data
const missingTables = EXPECTED_TABLES.filter((table) => !db.publicTables.includes(table));
const unexpectedTables = db.publicTables.filter((table) => !EXPECTED_TABLES.includes(table)).sort();
check("MINDOT tables", [
  ...missingTables.map((table) => `missing ${table}`),
  ...unexpectedTables.map((table) => `unexpected public table ${table}`),
]);
check(
  "application data",
  Object.entries(db.rowCounts)
    .filter(([, count]) => count !== 0)
    .map(([table, count]) => `${table} has ${count} rows, expected 0`)
);

// ---------------------------------------------------------------------------
// 5. Report.
// ---------------------------------------------------------------------------
console.log(`transaction_read_only: ${db.readOnly}`);
console.log(`migration_count: ${db.migrations.length}`);
console.log(`latest_migration: ${latestTag}`);
console.log("");
for (const line of results) console.log(line);
console.log("");
console.log("application data:");
for (const table of EXPECTED_TABLES) console.log(`${table}: ${table in db.rowCounts ? db.rowCounts[table] : "(table missing)"}`);
console.log(`unexpected public tables: ${unexpectedTables.length}${unexpectedTables.length ? ` (${unexpectedTables.join(", ")})` : ""}`);
console.log("");

if (failures.length === 0) {
  console.log("PASS — staging schema and data state verified.");
  process.exit(0);
}
console.log("FAIL — staging post-migration verification failed.");
for (const failure of failures) console.log(`  - ${failure}`);
process.exit(1);
