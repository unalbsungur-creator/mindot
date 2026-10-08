import { isAppleUserId } from "@/features/users/lib/providerIds";
import type { UserAccountStatus } from "@/features/users/types";
import { getMobileAuthConfig } from "@/lib/env";
import {
  issueMobileAccessToken,
  verifyMobileAccessToken,
  type MobileAccessTokenConfig,
  type MobileAuthProvider,
} from "./lib/mobileAccessToken";
import { compareRefreshSecret, generateRefreshToken, parseRefreshToken } from "./lib/refreshToken";
import { mobileSessionRepository, type MobilePlatform, type MobileSessionRepository } from "./mobileSessionRepository";

/**
 * Native-app sessions: short-lived Bearer access tokens (lib/mobileAccessToken)
 * backed by a `mobile_sessions` row and a rotating opaque refresh token
 * (lib/refreshToken). Independent of Auth.js — the web's cookie session is
 * untouched by anything here.
 *
 * No request context: callers pass the Authorization header value or the
 * refresh token. Every outcome is a typed result; a database or
 * configuration failure is `unavailable` (fail closed — unlike the web
 * session's account check, nothing here is let through when the database
 * can't answer). Logs carry an error's name only, never a token, secret,
 * hash or query parameter.
 */

/** Sliding refresh-session lifetime: each rotation extends it by this much. No absolute cap yet. */
export const MOBILE_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export interface MobileSessionConfig {
  accessToken: MobileAccessTokenConfig;
  sessionTtlSeconds: number;
}

export interface MobileSessionDeps {
  sessions: MobileSessionRepository;
  /** Resolved per call, never at module load — a missing secret fails that call, closed. */
  config: () => MobileSessionConfig;
  now: () => Date;
  newSessionId: () => string;
}

function defaultConfig(): MobileSessionConfig {
  const config = getMobileAuthConfig();
  return {
    accessToken: {
      secret: config.mobileJwtSecret,
      issuer: config.mobileJwtIssuer,
      audience: config.mobileJwtAudience,
      ttlSeconds: config.accessTokenTtlSeconds,
    },
    sessionTtlSeconds: MOBILE_SESSION_TTL_SECONDS,
  };
}

const defaultDeps: MobileSessionDeps = {
  sessions: mobileSessionRepository,
  config: defaultConfig,
  now: () => new Date(),
  newSessionId: () => crypto.randomUUID(),
};

export interface MobileTokenPair {
  sessionId: string;
  accessToken: string;
  accessTokenExpiresAt: Date;
  /** Plaintext — returned to the client once, never stored. */
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

/** How an account authenticates, derived from its id — the same rule `isAppleUserId` applies everywhere else. */
export function mobileAuthProviderFor(userId: string): MobileAuthProvider {
  return isAppleUserId(userId) ? "apple" : "google";
}

function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}

function logFailure(operation: string, error: unknown): void {
  console.error(`[mobile-auth] ${operation} failed`, error instanceof Error ? error.name : "unknown");
}

export type CreateMobileSessionResult = { ok: true; tokens: MobileTokenPair } | { ok: false; error: "unavailable" };

/**
 * Opens a new session for an account whose sign-in the caller has already
 * verified and completed. Always a fresh, server-generated session id — a
 * client can never choose or reuse one.
 */
export async function createMobileSession(
  params: { userId: string; platform: MobilePlatform },
  deps: MobileSessionDeps = defaultDeps
): Promise<CreateMobileSessionResult> {
  try {
    const config = deps.config();
    const now = deps.now();
    const sessionId = deps.newSessionId();
    const { token: refreshToken, secretHash } = generateRefreshToken(sessionId);
    const refreshTokenExpiresAt = addSeconds(now, config.sessionTtlSeconds);

    await deps.sessions.create({
      id: sessionId,
      userId: params.userId,
      refreshTokenHash: secretHash,
      platform: params.platform,
      expiresAt: refreshTokenExpiresAt,
      now,
    });

    const access = await issueMobileAccessToken(
      { sub: params.userId, sid: sessionId, authProvider: mobileAuthProviderFor(params.userId) },
      config.accessToken,
      now
    );
    return {
      ok: true,
      tokens: { sessionId, accessToken: access.token, accessTokenExpiresAt: access.expiresAt, refreshToken, refreshTokenExpiresAt },
    };
  } catch (error) {
    logFailure("create session", error);
    return { ok: false, error: "unavailable" };
  }
}

export type RefreshMobileSessionError =
  | "session-invalid"
  | "session-revoked"
  | "session-expired"
  | "refresh-reuse-detected"
  | "unavailable";

export type RefreshMobileSessionResult = { ok: true; tokens: MobileTokenPair } | { ok: false; error: RefreshMobileSessionError };

/**
 * Exchanges the current refresh token for a new pair, in one transaction
 * on the row-locked session:
 *   - unknown session, or a secret matching neither hash → session-invalid
 *   - revoked → session-revoked; expired → session-expired
 *   - the current secret → rotate (current → previous, new current,
 *     expiry extended) and issue a new access token
 *   - the previous secret → reuse: the token was already spent, so someone
 *     else may hold it. The session is revoked and that revocation is
 *     committed (returned, never thrown) before reporting the reuse.
 * Strict: there is no grace window for a client that retries a refresh
 * whose response it lost — clients must refresh single-flight. Only one
 * generation back is kept, so an older token is just session-invalid.
 */
export async function refreshMobileSession(
  refreshToken: string,
  deps: MobileSessionDeps = defaultDeps
): Promise<RefreshMobileSessionResult> {
  const parsed = parseRefreshToken(refreshToken);
  if (!parsed) return { ok: false, error: "session-invalid" };

  try {
    const config = deps.config();
    const now = deps.now();

    const outcome = await deps.sessions.transaction(async (tx) => {
      const session = await tx.getByIdForUpdate(parsed.sid);
      if (!session) return { ok: false as const, error: "session-invalid" as const };
      if (session.revokedAt) return { ok: false as const, error: "session-revoked" as const };
      if (session.expiresAt.getTime() <= now.getTime()) return { ok: false as const, error: "session-expired" as const };

      if (compareRefreshSecret(parsed.secret, session.refreshTokenHash)) {
        const next = generateRefreshToken(session.id);
        const expiresAt = addSeconds(now, config.sessionTtlSeconds);
        await tx.rotate(session.id, {
          refreshTokenHash: next.secretHash,
          previousRefreshTokenHash: session.refreshTokenHash,
          expiresAt,
          now,
        });
        return { ok: true as const, userId: session.userId, refreshToken: next.token, expiresAt };
      }

      if (session.previousRefreshTokenHash && compareRefreshSecret(parsed.secret, session.previousRefreshTokenHash)) {
        await tx.revoke(session.id, now);
        return { ok: false as const, error: "refresh-reuse-detected" as const };
      }

      return { ok: false as const, error: "session-invalid" as const };
    });

    if (!outcome.ok) return outcome;

    const access = await issueMobileAccessToken(
      { sub: outcome.userId, sid: parsed.sid, authProvider: mobileAuthProviderFor(outcome.userId) },
      config.accessToken,
      now
    );
    return {
      ok: true,
      tokens: {
        sessionId: parsed.sid,
        accessToken: access.token,
        accessTokenExpiresAt: access.expiresAt,
        refreshToken: outcome.refreshToken,
        refreshTokenExpiresAt: outcome.expiresAt,
      },
    };
  } catch (error) {
    logFailure("refresh session", error);
    return { ok: false, error: "unavailable" };
  }
}

export type RevokeMobileSessionResult =
  | { ok: true; status: "revoked" | "already-revoked" | "not-revoked" }
  | { ok: false; error: "session-invalid" | "unavailable" };

/**
 * Ends the session a refresh token belongs to (sign-out). The token is the
 * proof of ownership: a bare session id is never accepted, and a token
 * whose secret matches neither the current nor the previous hash revokes
 * nothing (`not-revoked`) — so no one can end another person's session by
 * knowing or guessing its id. Idempotent; an unknown session is
 * `not-revoked` too, never an error that would confirm whether it exists.
 */
export async function revokeMobileSession(
  refreshToken: string,
  deps: MobileSessionDeps = defaultDeps
): Promise<RevokeMobileSessionResult> {
  const parsed = parseRefreshToken(refreshToken);
  if (!parsed) return { ok: false, error: "session-invalid" };

  try {
    const now = deps.now();
    const status = await deps.sessions.transaction(async (tx) => {
      const session = await tx.getByIdForUpdate(parsed.sid);
      if (!session) return "not-revoked" as const;
      const owns =
        compareRefreshSecret(parsed.secret, session.refreshTokenHash) ||
        (session.previousRefreshTokenHash !== null && compareRefreshSecret(parsed.secret, session.previousRefreshTokenHash));
      if (!owns) return "not-revoked" as const;
      if (session.revokedAt) return "already-revoked" as const;
      await tx.revoke(session.id, now);
      return "revoked" as const;
    });
    return { ok: true, status };
  } catch (error) {
    logFailure("revoke session", error);
    return { ok: false, error: "unavailable" };
  }
}

export interface MobileIdentity {
  userId: string;
  sessionId: string;
  authProvider: MobileAuthProvider;
  platform: MobilePlatform;
  /** Not enforced here — like the web session, suspension is each action's own check. */
  status: UserAccountStatus;
}

export type AuthenticateMobileRequestResult =
  | { ok: true; identity: MobileIdentity }
  | { ok: false; error: "unauthorized" | "admin-account" | "unavailable" };

const BEARER_PATTERN = /^Bearer ([^\s]+)$/;

/**
 * Authenticates one API request from its Authorization header. The access
 * token must verify (signature, issuer, audience, lifetime), and then — on
 * every request — its session must still be active and belong to the
 * token's subject, and the account must still exist. Revoking a session or
 * deleting an account therefore takes effect immediately, not when the
 * access token expires.
 *
 * Authorization comes from the database, never from the token: the token's
 * `role` is ignored, and an account whose stored role is admin is refused
 * (admin is web-only). The token's `authProvider` must agree with the
 * account id. A suspended account still authenticates, as on the web.
 */
export async function authenticateMobileRequest(
  authorizationHeader: string | null | undefined,
  deps: MobileSessionDeps = defaultDeps
): Promise<AuthenticateMobileRequestResult> {
  const match = typeof authorizationHeader === "string" ? BEARER_PATTERN.exec(authorizationHeader) : null;
  if (!match) return { ok: false, error: "unauthorized" };

  try {
    const config = deps.config();
    const now = deps.now();
    const claims = await verifyMobileAccessToken(match[1], config.accessToken, now);
    if (!claims) return { ok: false, error: "unauthorized" };

    const session = await deps.sessions.getActiveWithUser(claims.sid, claims.sub, now);
    if (!session || session.userId !== claims.sub || session.sessionId !== claims.sid) {
      return { ok: false, error: "unauthorized" };
    }
    if (claims.authProvider !== mobileAuthProviderFor(session.userId)) return { ok: false, error: "unauthorized" };
    if (session.role === "admin") return { ok: false, error: "admin-account" };

    return {
      ok: true,
      identity: {
        userId: session.userId,
        sessionId: session.sessionId,
        authProvider: claims.authProvider,
        platform: session.platform,
        status: session.status,
      },
    };
  } catch (error) {
    logFailure("authenticate request", error);
    return { ok: false, error: "unavailable" };
  }
}
