"use server";

import { auth, signOut } from "@/features/auth/auth";
import { deleteOwnAccountWithSession, type DeleteOwnAccountActionError, type DeleteOwnAccountActionResult } from "./accountDeletion";

export type DeleteAccountError = DeleteOwnAccountActionError;

export type DeleteAccountActionResult = DeleteOwnAccountActionResult;

/**
 * Deletes the signed-in user's own account (see
 * userRepository.deleteAccount for exactly what is deleted vs anonymized).
 * The account is always the session's — this action takes no user id at
 * all, so it can never target someone else's. The caller must retype the
 * account's email as the second confirmation step; deleteOwnAccountForUser
 * (./accountDeletion) checks it server-side against the database row,
 * never trusted from the client. The flow itself is
 * deleteOwnAccountWithSession (./accountDeletion); this action only
 * supplies Auth.js's `auth` and `signOut`.
 *
 * Replay-safe: after a successful deletion the session no longer resolves
 * (the jwt callback's account check), so a repeated call is simply
 * `auth-required`; two concurrent calls serialize on the row lock and the
 * second finds nothing to delete. Server Actions carry Next.js's own
 * same-origin check, so this can't be triggered cross-site.
 */
export async function deleteOwnAccount(confirmationEmail: string): Promise<DeleteAccountActionResult> {
  return deleteOwnAccountWithSession(confirmationEmail, {
    auth: () => auth(),
    signOut: (options) => signOut(options),
  });
}
