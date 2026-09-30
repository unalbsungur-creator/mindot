import { revokeAppleAuthorizationForUser, type AppleRevokeOutcome } from "@/features/auth/lib/appleRevoke";
import { isAppleUserId } from "./lib/providerIds";
import { userRepository, type DeleteAccountResult } from "./repository";

export type AccountDeletionOutcome = DeleteAccountResult | { status: "apple-revoke-failed" };

/**
 * Account deletion across two systems that can't share a transaction:
 * Apple's authorization (App Review 5.1.1(v): Sign in with Apple tokens
 * must be revoked) and MINDOT's own database. Order: **revoke at Apple
 * first, then the local deletion** (userRepository.deleteAccount — one
 * atomic transaction, unchanged).
 *
 *   - Apple fails (unreachable, 5xx, or our client secret rejected): the
 *     account is NOT deleted — nothing local has changed — and the user is
 *     asked to try again. Never a half-deleted account.
 *   - Revoke succeeds, local deletion then fails: the account simply
 *     remains; a retry revokes an already-dead token (Apple answers
 *     `invalid_grant` → treated as done) and deletes. Harmless.
 *   - Nothing to revoke (no stored token, token already invalid), Apple
 *     switched off on this deployment, or a stored token that no longer
 *     decrypts: deletion proceeds — blocking it forever would be worse, and
 *     there's nothing usable to revoke. The last two log a warning.
 *
 * No retry queue: every failure leaves either nothing changed or nothing
 * owed. Google/admin accounts skip the Apple step entirely.
 */
export async function deleteUserAccount(
  userId: string,
  deps: { revokeApple: (userId: string) => Promise<AppleRevokeOutcome> } = { revokeApple: revokeAppleAuthorizationForUser }
): Promise<AccountDeletionOutcome> {
  if (isAppleUserId(userId)) {
    const outcome = await deps.revokeApple(userId);
    if (outcome === "failed") return { status: "apple-revoke-failed" };
    if (outcome === "not-configured" || outcome === "unreadable") {
      console.warn("[account-deletion] Apple authorization not revoked", outcome);
    }
  }
  return userRepository.deleteAccount(userId);
}
