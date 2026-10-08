"use server";

import { auth, signOut } from "@/features/auth/auth";
import { deleteOwnAccountForUser } from "./accountDeletion";

export type DeleteAccountError = "auth-required" | "admin-account" | "confirmation-mismatch" | "apple-revoke-failed" | "failed";

export interface DeleteAccountActionResult {
  ok: boolean;
  error?: DeleteAccountError;
}

/**
 * Deletes the signed-in user's own account (see
 * userRepository.deleteAccount for exactly what is deleted vs anonymized).
 * The account is always the session's — this action takes no user id at
 * all, so it can never target someone else's. The caller must retype the
 * account's email as the second confirmation step; deleteOwnAccountForUser
 * (./accountDeletion) checks it server-side against the database row,
 * never trusted from the client.
 *
 * Replay-safe: after a successful deletion the session no longer resolves
 * (the jwt callback's account check), so a repeated call is simply
 * `auth-required`; two concurrent calls serialize on the row lock and the
 * second finds nothing to delete. Server Actions carry Next.js's own
 * same-origin check, so this can't be triggered cross-site.
 */
export async function deleteOwnAccount(confirmationEmail: string): Promise<DeleteAccountActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "auth-required" };
  if (session.user.role === "admin") return { ok: false, error: "admin-account" };

  const result = await deleteOwnAccountForUser({ userId: session.user.id, confirmationEmail });
  if (!result.ok) {
    return { ok: false, error: result.error === "account-not-found" ? "auth-required" : result.error };
  }

  // Clear this browser's cookie now; every other copy of the session is
  // already dead via the jwt callback's account check.
  await signOut({ redirect: false });
  return { ok: true };
}
