import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireRuntimeEnv } from "@/lib/env";
import * as schema from "./schema";

// Minimal ambient shape for the `HYPERDRIVE` binding declared in
// wrangler.jsonc. Not sourced from `@cloudflare/workers-types` (not a
// dependency of this project) — only the one field this module reads.
declare global {
  interface CloudflareEnv {
    HYPERDRIVE?: { connectionString: string };
  }
}

type Sql = ReturnType<typeof postgres>;
type Database = ReturnType<typeof drizzle<typeof schema>>;
type PostgresOptions = Parameters<typeof postgres>[1];

// Cached on `globalThis` so Next's dev-mode HMR doesn't open a fresh
// connection pool on every module reload. Only ever populated on the
// DATABASE_URL/local path — see the Hyperdrive branch in getDb() below for
// why the Worker path deliberately never writes to this cache.
const globalForDb = globalThis as unknown as { mindotSql?: Sql; mindotDb?: Database };

/**
 * Cloudflare Workers production has no route to a plain TCP Postgres host
 * (Neon or otherwise) except through the `HYPERDRIVE` binding — Hyperdrive
 * rewrites the connection string to point through its own pooling proxy,
 * and that rewritten string is the only thing that actually reaches the
 * database from inside the Worker. `getCloudflareContext()` (sync) reads
 * that binding from the request-scoped context the OpenNext Worker
 * entrypoint sets up before any route code runs, so this is safe to call
 * synchronously here.
 *
 * It throws when there is no such context — plain `next dev` (which never
 * calls `initOpenNextCloudflareForDev`), and the tsx scripts under
 * src/lib/db/*.ts that run directly under Node outside any Worker — and in
 * both of those cases DATABASE_URL from .env.local (the local Docker
 * Postgres) is exactly the right fallback.
 */
function resolveConnection(): { connectionString: string; options: PostgresOptions; isHyperdrive: boolean } {
  try {
    const { env } = getCloudflareContext();
    if (env.HYPERDRIVE) {
      return {
        connectionString: env.HYPERDRIVE.connectionString,
        // Hyperdrive recommends skipping the extra round-trip postgres.js
        // otherwise makes on connect to look up custom array types.
        options: { max: 5, fetch_types: false },
        isHyperdrive: true,
      };
    }
  } catch {
    // Not running inside a Cloudflare Worker request — fall through to DATABASE_URL.
  }
  return { connectionString: requireRuntimeEnv("DATABASE_URL"), options: { max: 5 }, isHyperdrive: false };
}

/**
 * Lazy on purpose: nothing here runs at module-import time, only when a
 * repository actually issues a query at request time. Every route that
 * touches the database is a dynamic route (never prerendered), so `next
 * build` never needs a real DATABASE_URL — it only becomes required when a
 * request actually reaches the database.
 *
 * Deliberately NOT cached across requests on the Hyperdrive path: Workers
 * ties a TCP socket's lifetime to the request context that opened it, so a
 * `postgres()` client created during one request and reused (via
 * `globalForDb`) during a later, unrelated request tries to read/write a
 * socket that no longer belongs to the current request — the Workers
 * runtime observed this as a hung request that never produced a response
 * (visible as an intermittent Cloudflare error 1101), not a clean
 * exception. Hyperdrive already pools the real upstream connections to
 * Postgres, so a fresh lightweight client per request here is cheap and is
 * Cloudflare's documented pattern. The DATABASE_URL/local-dev path is a
 * normal long-lived Node process without that constraint, so it keeps the
 * `globalForDb` cache (mainly to survive Next's dev-mode HMR reloads).
 */
export function getDb(): Database {
  const { connectionString, options, isHyperdrive } = resolveConnection();
  if (isHyperdrive) {
    return drizzle(postgres(connectionString, options), { schema });
  }
  if (!globalForDb.mindotDb) {
    globalForDb.mindotSql = postgres(connectionString, options);
    globalForDb.mindotDb = drizzle(globalForDb.mindotSql, { schema });
  }
  return globalForDb.mindotDb;
}
