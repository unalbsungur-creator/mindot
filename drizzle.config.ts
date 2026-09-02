import { defineConfig } from "drizzle-kit";

// drizzle-kit is a standalone CLI, not Next.js — it never auto-loads
// .env.local the way `next dev`/`next build` do, so DATABASE_URL would
// otherwise be empty for every db:* command a developer runs by hand
// (confirmed directly, EPIC 015: `npm run db:migrate` failed with "Please
// provide required params... url: ''" run exactly as README documents).
// Same try/catch pattern src/lib/db/seed.ts and verify.ts already use, so
// a CI environment that sets DATABASE_URL directly (no .env.local file)
// still works unchanged.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local — fine, DATABASE_URL may already be set in the environment.
}

export default defineConfig({
  out: "./drizzle",
  schema: "./src/lib/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
