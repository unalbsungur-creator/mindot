/**
 * `npm run db:deleted-invitations:unlink` — security pack 2b: for accounts
 * deleted before deleteAccount cut the invitation trail, clear the address
 * of every invitation a deleted account's card points at and drop those
 * cards' invitation_id (src/features/users/lib/deletedInvitationUnlink.ts).
 *
 *   UNLINK_DATABASE_URL='postgresql://…' npm run db:deleted-invitations:unlink              # dry run
 *   UNLINK_DATABASE_URL='postgresql://…' CONFIRM_DELETED_INVITATION_UNLINK=MINDOT-UNLINK-DELETED-INVITATIONS \
 *     npm run db:deleted-invitations:unlink -- --apply                                       # writes
 *
 * Release order: code deploy (new deletions already unlink) → backup → this
 * script (dry run, then --apply after approval). The target comes only from
 * the shell — never from .env.local. Prints counts and short ids only: never
 * a connection string, an address or any account data. Idempotent.
 */
import postgres from "postgres";
import { runDeletedInvitationUnlink } from "@/features/users/lib/deletedInvitationUnlink";

const CONFIRMATION = "MINDOT-UNLINK-DELETED-INVITATIONS";

async function main(): Promise<void> {
  const target = process.env.UNLINK_DATABASE_URL?.trim();
  if (!target) throw new Error("Set UNLINK_DATABASE_URL in the shell (never .env.local).");
  const apply = process.argv.includes("--apply");
  if (apply && process.env.CONFIRM_DELETED_INVITATION_UNLINK !== CONFIRMATION) {
    throw new Error(`--apply needs CONFIRM_DELETED_INVITATION_UNLINK=${CONFIRMATION} (after a dry run and a restore point).`);
  }
  console.log(`[db:deleted-invitations:unlink] ${apply ? "APPLY" : "DRY RUN — nothing is written"}`);

  const sql = postgres(target, { max: 1, connect_timeout: 10, idle_timeout: 10, onnotice: () => {} });
  try {
    const result = await runDeletedInvitationUnlink(sql, { apply });
    const short = (ids: string[]) => (ids.length ? ids.map((id) => id.slice(0, 8)).join(", ") : "—");
    console.log(`  cards of deleted accounts still linked to an invitation: ${result.cardIds.length}  (${short(result.cardIds)})`);
    console.log(`  invitations holding an address behind them:             ${result.invitationIds.length}  (${short(result.invitationIds)})`);
    console.log(`  … of which an active account also wrote with:           ${result.sharedWithActiveAuthors}`);
    if (apply) {
      console.log(`[db:deleted-invitations:unlink] cleared ${result.invitationsCleared} address(es), unlinked ${result.cardsUnlinked} card(s)`);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

void main().catch((error: unknown) => {
  const secret = process.env.UNLINK_DATABASE_URL ?? "";
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`[db:deleted-invitations:unlink] Failed: ${secret ? message.replaceAll(secret, "[redacted connection string]") : message}`);
  process.exitCode = 1;
});
