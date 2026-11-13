import type { UserAccountStatus, UserRole } from "@/features/users/types";

/**
 * The account fields admin authorization is decided on, read fresh from the
 * `users` row on every admin request (userRepository.getAuthorizationState —
 * one primary-key lookup). `null` = no such row.
 */
export interface AdminAuthorizationState {
  role: UserRole;
  status: UserAccountStatus;
  deleted: boolean;
}

/** The narrow part of a session user this check reads. */
export interface AdminCandidate {
  id?: string | null;
  role?: UserRole | null;
}

/**
 * Is this row an admin *right now*? Role "admin", status "active", not a
 * deleted account's tombstone. Anything else — including a row that no
 * longer exists — is not.
 */
export function isCurrentAdmin(state: AdminAuthorizationState | null): boolean {
  return state !== null && state.role === "admin" && state.status === "active" && !state.deleted;
}

/**
 * Security review 2026-11-13 (Aşama 2a/5): the JWT's `role` is fixed at
 * sign-in and lives for the whole session (30 days by default), so a demoted
 * or suspended admin used to keep admin power until the cookie expired. The
 * session's role is now only a cheap first filter (a non-admin session never
 * costs a query); authorization itself is the current database row.
 *
 * Fails closed: a lookup error denies admin access (logged by error name
 * only) — unlike the per-request account check in auth.ts, which keeps
 * ordinary sessions alive during a database outage, admin power is never
 * granted without a fresh confirmation.
 */
export async function resolveCurrentAdmin<T extends AdminCandidate>(
  user: T | null | undefined,
  loadState: (userId: string) => Promise<AdminAuthorizationState | null>
): Promise<T | null> {
  if (!user?.id || user.role !== "admin") return null;
  let state: AdminAuthorizationState | null;
  try {
    state = await loadState(user.id);
  } catch (error) {
    console.error("[auth] admin re-check failed", error instanceof Error ? error.name : "unknown");
    return null;
  }
  return isCurrentAdmin(state) ? user : null;
}
