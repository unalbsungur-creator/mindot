import { verifyPassword } from "@/features/users/lib/password";
import { appleUserId } from "@/features/users/lib/providerIds";
import { userRepository, type UserRepository } from "@/features/users/repository";
import type { User, UserRole } from "@/features/users/types";
import { appleTokenRepository, type AppleTokenClient, type AppleTokenRepository } from "./appleTokenRepository";
import type { AppleIdentity } from "./lib/appleProfile";
import { verifyAdminLoginTurnstile } from "./lib/turnstile";

/**
 * Provider sign-in completion — the account rules every Google/Apple
 * sign-in goes through, independent of how the provider's identity was
 * verified. Auth.js (features/auth/auth.ts) verifies the OAuth/OIDC flow and
 * calls these from its callbacks; a future mobile token exchange will verify
 * the provider's ID token itself and call the same functions, so web and
 * mobile can never apply different account rules.
 *
 * No request context here: no auth(), cookies(), redirects or sign-out.
 * Callers pass only already-verified claims.
 *
 * Each provider has three steps, mirroring Auth.js's own two callbacks:
 *   - check…  `signIn` callback: may this identity sign in? Read-only.
 *   - finish… `jwt` callback: create/update the account (only after check…).
 *   - complete… both in one call, for callers without Auth.js's split.
 *
 * The rules (unchanged from the callbacks they came from):
 *   - Never merge by email: a *new* identity whose email already belongs to
 *     a different account is refused (`account-exists`) — linking by
 *     matching email would be an account-takeover path.
 *   - A new identity without an email is refused.
 *   - A provider sign-in never grants admin: new rows are always "user"
 *     (userRepository.upsert…), and an Apple session's role is "user"
 *     whatever the row says.
 */

/** Why a provider sign-in was refused. `denied` carries no user-facing reason (Auth.js shows its generic error). */
export type ProviderSignInRefusal = "account-exists" | "apple-email-missing" | "denied";

export type ProviderSignInCheck = { ok: true } | { ok: false; refusal: ProviderSignInRefusal };

export type ProviderSignInResult = { ok: true; user: User; role: UserRole } | { ok: false; refusal: ProviderSignInRefusal };

/** Google's verified ID-token claims MINDOT uses. */
export interface GoogleSignInClaims {
  sub: string;
  email: string | null;
  name: string | null;
  picture: string | null;
}

/** Google claims with the email present — required to create/update the account. */
export type GoogleAccountClaims = GoogleSignInClaims & { email: string };

/** The Apple refresh token from this sign-in's token response, kept only for revocation at account deletion. */
export interface AppleRefreshTokenToStore {
  refreshToken: string;
  encryptionKey: string;
}

export interface ProviderSignInDeps {
  users: Pick<UserRepository, "classifyProviderSignIn" | "upsertFromGoogleProfile" | "upsertFromAppleProfile">;
  appleTokens: Pick<AppleTokenRepository, "save">;
}

const defaultDeps: ProviderSignInDeps = { users: userRepository, appleTokens: appleTokenRepository };

export async function checkGoogleSignIn(
  claims: GoogleSignInClaims,
  deps: ProviderSignInDeps = defaultDeps
): Promise<ProviderSignInCheck> {
  if (!claims.sub) return { ok: false, refusal: "denied" };
  const outcome = await deps.users.classifyProviderSignIn(claims.sub, claims.email);
  if (outcome === "email-in-use") return { ok: false, refusal: "account-exists" };
  if (outcome === "email-missing") return { ok: false, refusal: "denied" };
  return { ok: true };
}

/** Upserts the Google account (always "user" on creation; an existing row keeps its role). Call only after checkGoogleSignIn. */
export async function finishGoogleSignIn(
  claims: GoogleAccountClaims,
  deps: ProviderSignInDeps = defaultDeps
): Promise<{ user: User; role: UserRole }> {
  const user = await deps.users.upsertFromGoogleProfile({
    id: claims.sub,
    email: claims.email,
    name: claims.name,
    image: claims.picture,
  });
  return { user, role: user.role };
}

export async function completeGoogleSignIn(
  claims: GoogleAccountClaims,
  deps: ProviderSignInDeps = defaultDeps
): Promise<ProviderSignInResult> {
  const check = await checkGoogleSignIn(claims, deps);
  if (!check.ok) return check;
  return { ok: true, ...(await finishGoogleSignIn(claims, deps)) };
}

export async function checkAppleSignIn(
  identity: AppleIdentity,
  deps: ProviderSignInDeps = defaultDeps
): Promise<ProviderSignInCheck> {
  if (!identity.sub) return { ok: false, refusal: "denied" };
  const outcome = await deps.users.classifyProviderSignIn(appleUserId(identity.sub), identity.email);
  if (outcome === "email-in-use") return { ok: false, refusal: "account-exists" };
  if (outcome === "email-missing") return { ok: false, refusal: "apple-email-missing" };
  return { ok: true };
}

/**
 * Upserts the Apple account and, when this sign-in returned one, stores its
 * refresh token for `client` (web Services ID or iOS bundle ID — revoked
 * under that client at account deletion). The role is always "user": Apple
 * can never produce an admin session. Call only after checkAppleSignIn.
 */
export async function finishAppleSignIn(
  identity: AppleIdentity,
  client: AppleTokenClient,
  refreshToken: AppleRefreshTokenToStore | null,
  deps: ProviderSignInDeps = defaultDeps
): Promise<{ user: User; role: UserRole }> {
  const user = await deps.users.upsertFromAppleProfile(identity);
  if (refreshToken && refreshToken.refreshToken && refreshToken.encryptionKey) {
    await deps.appleTokens.save(user.id, client, refreshToken.refreshToken, refreshToken.encryptionKey);
  }
  return { user, role: "user" };
}

export async function completeAppleSignIn(
  identity: AppleIdentity,
  client: AppleTokenClient,
  refreshToken: AppleRefreshTokenToStore | null = null,
  deps: ProviderSignInDeps = defaultDeps
): Promise<ProviderSignInResult> {
  const check = await checkAppleSignIn(identity, deps);
  if (!check.ok) return check;
  return { ok: true, ...(await finishAppleSignIn(identity, client, refreshToken, deps)) };
}

export interface AdminCredentialsDeps {
  users: Pick<UserRepository, "getCredentialsByEmail" | "recordFailedLogin" | "recordSuccessfulLogin">;
  verifyPassword: (password: string, storedHash: string) => Promise<boolean>;
  /**
   * Cloudflare Turnstile check (GÖREV 30 / P1). Returns `true` only for a
   * token that passes siteverify with the expected action and hostname;
   * fail-closed on anything else. Injected so tests never hit the network.
   * `remoteIp` is bound in by the caller — see {@link createAdminCredentialsDeps}.
   */
  verifyTurnstile: (token: string) => Promise<boolean>;
}

/**
 * The default admin-credentials dependencies, with the Turnstile verifier
 * bound to the (trusted, edge-provided) client IP for this request. The IP is
 * resolved by the caller (`authorize()` in auth.ts, via `CF-Connecting-IP`);
 * it defaults to `null`, which siteverify treats as "no remoteip".
 */
export function createAdminCredentialsDeps(remoteIp: string | null = null): AdminCredentialsDeps {
  return {
    users: userRepository,
    verifyPassword,
    verifyTurnstile: (token) => verifyAdminLoginTurnstile(token, remoteIp),
  };
}

/**
 * The Credentials provider's `authorize()` (features/auth/auth.ts): the one
 * admin's email + password sign-in. Returns `null` for every rejection —
 * failed Turnstile, unknown email, no password, non-admin, suspended, locked
 * out, wrong password — so the caller can never tell *why* (no email
 * enumeration).
 *
 * GÖREV 30 / P1: a Cloudflare Turnstile check runs FIRST, before any database
 * query. A missing or invalid token returns before `getCredentialsByEmail`
 * and, crucially, never calls `recordFailedLogin` — so a bot that cannot
 * solve the challenge cannot drive the real admin's lockout counter. The
 * token lives in `credentials.turnstileToken`, so it arrives identically on
 * both the Server Action and the raw `/api/auth/callback/credentials` paths.
 *
 * The password/lockout logic below is unchanged from the P0 fix: while
 * `lockedUntil` is after `now`, the password is not checked at all, so even
 * the right one is refused. The same `now` is used for that check and for
 * recording a failure, so "expired" means the same thing to both; the failure
 * after an expired lockout starts a fresh count (userRepository.recordFailedLogin).
 */
export async function verifyAdminCredentials(
  credentials: Partial<Record<"email" | "password" | "turnstileToken", unknown>> | undefined,
  now: Date = new Date(),
  deps: AdminCredentialsDeps = createAdminCredentialsDeps()
): Promise<{ id: string; name: string | null; role: UserRole } | null> {
  // Turnstile first — fail-closed, no database query, no counter change.
  const turnstileToken = typeof credentials?.turnstileToken === "string" ? credentials.turnstileToken : "";
  if (!(await deps.verifyTurnstile(turnstileToken))) return null;

  const email = typeof credentials?.email === "string" ? credentials.email.trim().toLowerCase() : "";
  const password = typeof credentials?.password === "string" ? credentials.password : "";
  if (!email || !password) return null;

  const candidate = await deps.users.getCredentialsByEmail(email);
  if (!candidate) return null;
  // Credentials sign-in is admin-only by design, and suspension is re-checked
  // here even though today only an admin account ever has a passwordHash.
  if (candidate.role !== "admin" || candidate.status !== "active") return null;
  if (candidate.lockedUntil && candidate.lockedUntil.getTime() > now.getTime()) return null;

  if (!(await deps.verifyPassword(password, candidate.passwordHash))) {
    await deps.users.recordFailedLogin(candidate.id, now);
    return null;
  }
  await deps.users.recordSuccessfulLogin(candidate.id);
  return { id: candidate.id, name: candidate.name, role: candidate.role };
}
