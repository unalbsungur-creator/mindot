import { revokeAppleAuthorizationForUser, type AppleRevokeOutcome } from "@/features/auth/lib/appleRevoke";
import { isAppleUserId } from "./lib/providerIds";
import { userRepository, type DeleteAccountResult, type UserRepository } from "./repository";

export type AccountDeletionOutcome = DeleteAccountResult | { status: "apple-revoke-failed" };

export interface AccountDeletionDeps {
  revokeApple: (userId: string) => Promise<AppleRevokeOutcome>;
  /** The local, single-transaction deletion. Defaults to userRepository.deleteAccount. */
  deleteAccount?: (userId: string) => Promise<DeleteAccountResult>;
}

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
  deps: AccountDeletionDeps = { revokeApple: revokeAppleAuthorizationForUser }
): Promise<AccountDeletionOutcome> {
  if (isAppleUserId(userId)) {
    const outcome = await deps.revokeApple(userId);
    if (outcome === "failed") return { status: "apple-revoke-failed" };
    if (outcome === "not-configured" || outcome === "unreadable") {
      console.warn("[account-deletion] Apple authorization not revoked", outcome);
    }
  }
  const deleteAccount = deps.deleteAccount ?? ((id: string) => userRepository.deleteAccount(id));
  return deleteAccount(userId);
}

export type DeleteOwnAccountServiceError =
  | "account-not-found"
  | "admin-account"
  | "confirmation-mismatch"
  | "apple-revoke-failed"
  | "failed";

export type DeleteOwnAccountServiceResult = { ok: true } | { ok: false; error: DeleteOwnAccountServiceError };

export interface DeleteOwnAccountDeps {
  users: Pick<UserRepository, "getById">;
  deleteAccount: (userId: string) => Promise<AccountDeletionOutcome>;
}

const defaultDeleteOwnAccountDeps: DeleteOwnAccountDeps = {
  users: userRepository,
  deleteAccount: (userId) => deleteUserAccount(userId),
};

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Deletes an account on its owner's request. `userId` is decided by the
 * caller — always its own authenticated account, never client input — and
 * session concerns (authentication, the session's own role, signing the
 * browser out) stay with the caller. The owner must retype the account's
 * email; it's checked here against the database row, never trusted from
 * the client.
 *
 * Check order: account → confirmation → (Apple revoke → transaction). The
 * admin refusal lives in the caller's session check and in the deletion
 * transaction itself (userRepository.deleteAccount), never earlier here.
 * A thrown error — the transaction rolled back, or the Apple step itself
 * threw — is `failed`: nothing was deleted.
 */
export async function deleteOwnAccountForUser(
  params: { userId: string; confirmationEmail: string },
  deps: DeleteOwnAccountDeps = defaultDeleteOwnAccountDeps
): Promise<DeleteOwnAccountServiceResult> {
  const user = await deps.users.getById(params.userId);
  if (!user) return { ok: false, error: "account-not-found" };
  if (typeof params.confirmationEmail !== "string" || normalizeEmail(params.confirmationEmail) !== normalizeEmail(user.email)) {
    return { ok: false, error: "confirmation-mismatch" };
  }

  let result: AccountDeletionOutcome;
  try {
    // Apple accounts are revoked at Apple first; see deleteUserAccount for
    // the failure model (a failed revoke deletes nothing).
    result = await deps.deleteAccount(user.id);
  } catch (error) {
    // Nothing was deleted. Log the error's kind only: driver errors carry
    // query parameters (personal data).
    console.error("[account-deletion] transaction failed", error instanceof Error ? error.name : "unknown");
    return { ok: false, error: "failed" };
  }
  if (result.status === "apple-revoke-failed") return { ok: false, error: "apple-revoke-failed" };
  if (result.status === "admin-account") return { ok: false, error: "admin-account" };
  if (result.status === "not-found") return { ok: false, error: "account-not-found" };
  return { ok: true };
}

export type DeleteOwnAccountActionError = "auth-required" | "admin-account" | "confirmation-mismatch" | "apple-revoke-failed" | "failed";

export interface DeleteOwnAccountActionResult {
  ok: boolean;
  error?: DeleteOwnAccountActionError;
}

export interface DeleteOwnAccountSessionDeps {
  /** The request's session — the server action passes Auth.js's `auth()`. */
  auth: () => Promise<{ user?: { id?: string | null; role?: string | null } | null } | null>;
  /** Clears this browser's session cookie — the server action passes Auth.js's `signOut`. */
  signOut: (options: { redirect: false }) => Promise<unknown>;
  deleteOwnAccount?: (params: { userId: string; confirmationEmail: string }) => Promise<DeleteOwnAccountServiceResult>;
}

/**
 * The body of the deleteOwnAccount server action (account-actions.ts),
 * which supplies `auth`/`signOut`. Kept here, outside the "use server"
 * module, so it can be tested without exposing a dependency-taking export
 * to the client. The account is always the session's; the session's role
 * refuses an admin before anything else runs.
 *
 * Once the deletion has committed the outcome is "deleted", whatever
 * happens next: a failing sign-out is logged (error name only) and the
 * result stays `{ ok: true }` — reporting a failure here would tell the
 * user nothing was deleted when everything was. The leftover cookie no
 * longer authenticates: the jwt callback's account check signs it out on
 * the next request.
 */
export async function deleteOwnAccountWithSession(
  confirmationEmail: string,
  deps: DeleteOwnAccountSessionDeps
): Promise<DeleteOwnAccountActionResult> {
  const session = await deps.auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "auth-required" };
  if (session?.user?.role === "admin") return { ok: false, error: "admin-account" };

  const deleteOwnAccount = deps.deleteOwnAccount ?? ((params) => deleteOwnAccountForUser(params));
  const result = await deleteOwnAccount({ userId, confirmationEmail });
  if (!result.ok) {
    return { ok: false, error: result.error === "account-not-found" ? "auth-required" : result.error };
  }

  // Clear this browser's cookie now; every other copy of the session is
  // already dead via the jwt callback's account check.
  try {
    await deps.signOut({ redirect: false });
  } catch (error) {
    console.error("[account-deletion] sign-out after deletion failed", error instanceof Error ? error.name : "unknown");
  }
  return { ok: true };
}
