import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { requireRuntimeEnv } from "@/lib/env";
import * as schema from "./schema";

type Sql = ReturnType<typeof postgres>;
type Database = ReturnType<typeof drizzle<typeof schema>>;

// Cached on `globalThis` so Next's dev-mode HMR doesn't open a fresh
// connection pool on every module reload.
const globalForDb = globalThis as unknown as { mindotSql?: Sql; mindotDb?: Database };

/**
 * Lazy on purpose: nothing here runs at module-import time, only when a
 * repository actually issues a query at request time. Every route that
 * touches the database is a dynamic route (never prerendered), so `next
 * build` never needs a real DATABASE_URL — it only becomes required when a
 * request actually reaches the database.
 */
export function getDb(): Database {
  if (!globalForDb.mindotDb) {
    const connectionString = requireRuntimeEnv("DATABASE_URL");
    globalForDb.mindotSql = postgres(connectionString, { max: 5 });
    globalForDb.mindotDb = drizzle(globalForDb.mindotSql, { schema });
  }
  return globalForDb.mindotDb;
}
