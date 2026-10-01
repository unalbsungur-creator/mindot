/**
 * `npm run build:cf:staging` — builds the OpenNext Worker bundle for the
 * staging Worker (wrangler.jsonc `env.staging`). Deploy it afterwards with
 * `npx opennextjs-cloudflare deploy --env staging`.
 *
 * Two things make a staging build different from `npm run build:cf`:
 *
 * 1. It refuses to run next to any `.env*` / `.dev.vars` file. OpenNext
 *    copies every value from `.env`, `.env.production`, `.env.local` … into
 *    the uploaded Worker bundle (`.open-next/cloudflare/next-env.mjs`) as
 *    runtime fallbacks for any binding the Worker lacks. A staging bundle
 *    built from a developer checkout would therefore carry that machine's
 *    secrets and its DATABASE_URL/AUTH_URL. Build from a clean worktree
 *    instead: `git worktree add ../mindot-staging-build`.
 * 2. It sets the build-time identity itself (APP_ENV, AUTH_URL,
 *    NEXT_PUBLIC_APP_URL), because statically prerendered output —
 *    robots.txt, sitemap.xml, metadataBase, client-inlined NEXT_PUBLIC_* —
 *    is fixed at build time and must already say "staging". DATABASE_URL is
 *    removed so the build never touches a database.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { getEnvironmentIsolationProblems } from "../appEnvironment";
import { STAGING_SITE_URL } from "../siteConfig";

const leakingFiles = readdirSync(process.cwd()).filter(
  (name) => (name.startsWith(".env") && name !== ".env.example") || name === ".dev.vars"
);
if (leakingFiles.length > 0) {
  console.error(
    `[build:cf:staging] Refusing to build: ${leakingFiles.join(", ")} would be embedded in the staging Worker bundle.\n` +
      "Build from a clean worktree instead, e.g.:\n" +
      "  git worktree add ../mindot-staging-build\n" +
      "  cd ../mindot-staging-build && npm ci && npm run build:cf:staging"
  );
  process.exit(1);
}
if (!existsSync("wrangler.jsonc")) {
  console.error("[build:cf:staging] Run this from the repository root.");
  process.exit(1);
}

const env: NodeJS.ProcessEnv = {
  ...process.env,
  APP_ENV: "staging",
  AUTH_URL: STAGING_SITE_URL,
  NEXT_PUBLIC_APP_URL: STAGING_SITE_URL,
};
delete env.DATABASE_URL;

const problems = getEnvironmentIsolationProblems("staging", env);
if (problems.length > 0) {
  console.error(`[build:cf:staging] ${problems.join(" ")}`);
  process.exit(1);
}

const result = spawnSync("npx", ["opennextjs-cloudflare", "build"], { stdio: "inherit", shell: true, env });
process.exit(result.status ?? 1);
