/**
 * `npm test` — runs every unit test under src/ in one `tsx --test` process.
 *
 * Discovers `*.test.ts` / `*.test.tsx` instead of keeping a hand-written
 * list in package.json: that one long "test" line was edited by every
 * branch that added a test (MB-01 and MN-01 both did), so parallel work
 * always collided on it. Excluded, because they run through their own npm
 * scripts:
 *   - `*.db.test.ts` — need a throwaway PostgreSQL (`test:db:*`);
 *   - SEPARATE below — need `--experimental-test-module-mocks` or their own
 *     process (`test:memories`, `test:wall-consent`, `test:tokens-page`…).
 * A new test file is picked up automatically; one that needs its own run
 * goes into SEPARATE together with its npm script.
 */
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

const SEPARATE = new Set([
  "src/app/admin/orders/[orderNumber]/page.test.tsx",
  "src/app/tokens/page.test.tsx",
  "src/features/memories/captureMode.test.tsx",
  "src/features/profile/memoryLibrary.test.tsx",
  "src/features/profile/publicWallLinks.test.tsx",
  "src/features/profile/wallConsent.test.tsx",
  "src/features/sharing/wallShareImage.test.tsx",
  "src/features/tokens/components/RecordShopierPurchaseDialog.test.tsx",
]);

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : walk(path);
    return [path];
  });
}

const files = walk("src")
  .map((path) => relative(".", path).split(sep).join("/"))
  .filter((path) => /\.test\.tsx?$/.test(path) && !/\.db\.test\.tsx?$/.test(path) && !SEPARATE.has(path))
  .sort();

if (files.length === 0) {
  console.error("No unit tests found under src/.");
  process.exit(1);
}

const result = spawnSync("npx", ["tsx", "--test", ...files.map((file) => `"${file}"`)], { stdio: "inherit", shell: true });
process.exit(result.status ?? 1);
