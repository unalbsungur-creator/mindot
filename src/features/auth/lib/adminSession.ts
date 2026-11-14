/**
 * Security pack 2b (2026-11-14): an admin session ends 7 days after its
 * sign-in, however often it is used. Ordinary sessions keep Auth.js's
 * rolling 30 days — the cookie's own expiry is shared by everyone, so the
 * admin cap is enforced on the token instead: `adminSignedInAt` is written
 * once, at a fresh admin sign-in, and never refreshed, so every later
 * request can measure the session's real age.
 *
 * A token that claims admin (Credentials provider or role "admin") but has
 * no valid `adminSignedInAt` — e.g. one issued before this rule existed —
 * counts as expired: fail closed, the admin simply signs in again.
 * Authorization itself is still decided per request from the current users
 * row (adminAuthorization.ts); this only bounds how long one sign-in lasts.
 */

export const ADMIN_SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export interface AdminSessionClaims {
  role?: string;
  authProvider?: string;
  adminSignedInAt?: number;
}

export function isAdminSessionToken(token: AdminSessionClaims): boolean {
  return token.authProvider === "credentials" || token.role === "admin";
}

/** Seconds since the epoch — the unit JWT claims use. */
export function nowInSeconds(now: Date): number {
  return Math.floor(now.getTime() / 1000);
}

export function isAdminSessionExpired(token: AdminSessionClaims, now: Date): boolean {
  if (!isAdminSessionToken(token)) return false;
  const startedAt = token.adminSignedInAt;
  if (typeof startedAt !== "number" || !Number.isFinite(startedAt)) return true;
  const age = nowInSeconds(now) - startedAt;
  // A start in the future can only be a forged or corrupted claim.
  if (age < 0) return true;
  return age >= ADMIN_SESSION_MAX_AGE_SECONDS;
}
