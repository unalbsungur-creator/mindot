import { appleUserId } from "@/features/users/lib/providerIds";
import { userRepository, type UserRepository } from "@/features/users/repository";
import type { User, UserRole } from "@/features/users/types";
import { appleTokenRepository, type AppleTokenClient, type AppleTokenRepository } from "./appleTokenRepository";
import type { AppleIdentity } from "./lib/appleProfile";

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
