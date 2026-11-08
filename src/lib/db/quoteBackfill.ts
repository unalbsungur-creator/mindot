/**
 * `npm run db:quotes:backfill` — MB-01: marks the quotes already on the
 * Wall (src/features/messages/lib/quoteBackfill.ts has the approved list).
 *
 *   QUOTE_BACKFILL_DATABASE_URL='postgresql://…' npm run db:quotes:backfill            # dry run
 *   QUOTE_BACKFILL_DATABASE_URL='postgresql://…' CONFIRM_QUOTE_BACKFILL=MINDOT-QUOTES-0029 \
 *     npm run db:quotes:backfill -- --apply                                             # writes
 *
 * Release order: staging 0029 → staging check → production 0029 → code
 * deploy → this script (dry run, then --apply). The target comes only from
 * the shell — never from .env.local — and the run refuses before 0029.
 * Prints each card's before/after state; never prints a connection string
 * or any account data (it reads only the card's own public fields).
 * Idempotent: a second run reports every card as unchanged.
 */
import postgres from "postgres";
import { describeState, runQuoteBackfill } from "@/features/messages/lib/quoteBackfill";

const CONFIRMATION = "MINDOT-QUOTES-0029";

async function main(): Promise<void> {
  const target = process.env.QUOTE_BACKFILL_DATABASE_URL?.trim();
  if (!target) throw new Error("Set QUOTE_BACKFILL_DATABASE_URL in the shell (never .env.local).");
  const apply = process.argv.includes("--apply");
  if (apply && process.env.CONFIRM_QUOTE_BACKFILL !== CONFIRMATION) {
    throw new Error(`--apply needs CONFIRM_QUOTE_BACKFILL=${CONFIRMATION} (after a dry run and a restore point).`);
  }
  let host = "(unparseable URL)";
  try {
    host = new URL(target).host;
  } catch {
    // postgres reports a malformed URL itself.
  }
  console.log(`[db:quotes:backfill] ${apply ? "APPLY" : "DRY RUN — nothing is written"} · target host ${host}`);

  const sql = postgres(target, { max: 1, connect_timeout: 10, idle_timeout: 10, onnotice: () => {} });
  try {
    const decisions = await runQuoteBackfill(sql, { apply });
    let updates = 0;
    for (const decision of decisions) {
      const id = decision.id.slice(0, 8);
      if (decision.action === "skip") {
        console.log(`  SKIP     ${id}  (${decision.reason})${decision.excerpt ? `  “${decision.excerpt}”` : ""}`);
      } else if (decision.action === "unchanged") {
        console.log(`  OK       ${id}  “${decision.excerpt}”\n           ${describeState(decision.before)}`);
      } else {
        updates += 1;
        console.log(`  ${apply ? "UPDATED " : "WOULD   "} ${id}  “${decision.excerpt}”\n           önce:  ${describeState(decision.before)}\n           sonra: ${describeState(decision.after)}`);
      }
    }
    const skipped = decisions.filter((decision) => decision.action === "skip").length;
    console.log(`[db:quotes:backfill] ${decisions.length} planned · ${updates} ${apply ? "updated" : "to update"} · ${decisions.length - updates - skipped} already done · ${skipped} skipped`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

void main().catch((error: unknown) => {
  const secret = process.env.QUOTE_BACKFILL_DATABASE_URL ?? "";
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`[db:quotes:backfill] Failed: ${secret ? message.replaceAll(secret, "[redacted connection string]") : message}`);
  process.exitCode = 1;
});
