/**
 * `npm run db:migrate:staging` — applies the committed migrations
 * (drizzle/, in journal order) to the staging database, and only there.
 *
 *   STAGING_DATABASE_URL='postgresql://…' npm run db:migrate:staging
 *
 * The target comes only from STAGING_DATABASE_URL in the shell — never from
 * .env.local, whose DATABASE_URL is the local development database — and
 * the script refuses when it equals that local URL. It is handed to
 * drizzle-kit as DATABASE_URL; drizzle.config.ts's loadEnvFile(".env.local")
 * never overrides a variable that's already set. Never point it at
 * production: production migrations stay the separate, manual release step
 * README's "Production database workflow" describes.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

const target = process.env.STAGING_DATABASE_URL?.trim();
if (!target) {
  console.error("[db:migrate:staging] Set STAGING_DATABASE_URL in the shell (not in .env.local).");
  process.exit(1);
}

let localUrl: string | undefined;
try {
  localUrl = parseEnv(readFileSync(".env.local", "utf-8")).DATABASE_URL?.trim();
} catch {
  // No .env.local — nothing to compare against.
}
if (localUrl && localUrl === target) {
  console.error("[db:migrate:staging] STAGING_DATABASE_URL is the local development DATABASE_URL — refusing.");
  process.exit(1);
}

const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf-8")) as {
  entries: { idx: number; tag: string }[];
};
let host = "(unparseable URL)";
try {
  host = new URL(target).host;
} catch {
  // drizzle-kit will report the malformed URL itself.
}
console.log(`[db:migrate:staging] Target host: ${host}`);
console.log(`[db:migrate:staging] ${journal.entries.length} migrations, applied in order (already-applied ones are skipped):`);
for (const entry of journal.entries) console.log(`  ${entry.tag}`);

const result = spawnSync("npx", ["drizzle-kit", "migrate"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, DATABASE_URL: target },
});
process.exit(result.status ?? 1);
