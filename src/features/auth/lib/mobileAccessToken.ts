import { jwtVerify, SignJWT } from "jose";

/**
 * Short-lived Bearer access tokens for the native apps (HS256, signed with
 * MOBILE_JWT_SECRET — see getMobileAuthConfig in src/lib/env.ts, never
 * AUTH_SECRET). Pure: the config is passed in, so nothing here reads the
 * environment, the database or the request.
 *
 * A valid token only proves "this server issued it, recently, for this
 * session". It is never enough on its own: every request must still check
 * the session (`sid`) and the account in the database, which is what makes
 * revocation and account deletion take effect immediately. `role` is always
 * "user" and is informational only — authorization never trusts it.
 */

export type MobileAuthProvider = "google" | "apple";

const MOBILE_AUTH_PROVIDERS: readonly MobileAuthProvider[] = ["google", "apple"];
const ALGORITHM = "HS256";
/** Clock skew accepted between this server and whoever checks `exp`/`iat`. */
export const MOBILE_ACCESS_TOKEN_CLOCK_TOLERANCE_SECONDS = 60;
const SECRET_MIN_BYTES = 32;

export interface MobileAccessTokenConfig {
  secret: string;
  issuer: string;
  audience: string;
  ttlSeconds: number;
}

/** What the server puts in a token. */
export interface MobileAccessTokenSubject {
  /** users.id */
  sub: string;
  /** mobile_sessions.id */
  sid: string;
  authProvider: MobileAuthProvider;
}

/** A verified token's claims. */
export interface MobileAccessTokenClaims extends MobileAccessTokenSubject {
  role: "user";
  iat: number;
  exp: number;
}

function signingKey(secret: string): Uint8Array {
  const key = new TextEncoder().encode(secret);
  // Fail closed even if a caller bypasses getMobileAuthConfig's own check.
  if (key.byteLength < SECRET_MIN_BYTES) throw new Error("The mobile JWT secret must be at least 32 bytes.");
  return key;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export async function issueMobileAccessToken(
  subject: MobileAccessTokenSubject,
  config: MobileAccessTokenConfig,
  now: Date = new Date()
): Promise<{ token: string; expiresAt: Date }> {
  if (!isNonEmptyString(subject.sub) || !isNonEmptyString(subject.sid) || !MOBILE_AUTH_PROVIDERS.includes(subject.authProvider)) {
    throw new Error("Invalid mobile access token subject.");
  }
  const iat = Math.floor(now.getTime() / 1000);
  const exp = iat + config.ttlSeconds;
  const token = await new SignJWT({ sid: subject.sid, role: "user", authProvider: subject.authProvider })
    .setProtectedHeader({ alg: ALGORITHM, typ: "JWT" })
    .setSubject(subject.sub)
    .setIssuer(config.issuer)
    .setAudience(config.audience)
    .setIssuedAt(iat)
    .setExpirationTime(exp)
    .sign(signingKey(config.secret));
  return { token, expiresAt: new Date(exp * 1000) };
}

/**
 * The token's claims, or `null` for anything not issued by this server for
 * this audience within its lifetime: bad signature, any algorithm but
 * HS256 (`none` included), wrong issuer/audience, expired, issued in the
 * future, older than the TTL, or a missing/unexpected claim. Never says
 * why — callers answer every failure the same way.
 */
export async function verifyMobileAccessToken(
  token: string,
  config: MobileAccessTokenConfig,
  now: Date = new Date()
): Promise<MobileAccessTokenClaims | null> {
  if (!isNonEmptyString(token)) return null;
  const key = signingKey(config.secret);
  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: [ALGORITHM],
      issuer: config.issuer,
      audience: config.audience,
      requiredClaims: ["sub", "sid", "role", "authProvider", "iat", "exp"],
      clockTolerance: MOBILE_ACCESS_TOKEN_CLOCK_TOLERANCE_SECONDS,
      // Also rejects an `iat` beyond the tolerance in the future.
      maxTokenAge: config.ttlSeconds,
      currentDate: now,
    });
    const { sub, sid, role, authProvider, iat, exp } = payload;
    if (
      !isNonEmptyString(sub) ||
      !isNonEmptyString(sid) ||
      role !== "user" ||
      !MOBILE_AUTH_PROVIDERS.includes(authProvider as MobileAuthProvider) ||
      typeof iat !== "number" ||
      typeof exp !== "number"
    ) {
      return null;
    }
    return { sub, sid, role, authProvider: authProvider as MobileAuthProvider, iat, exp };
  } catch {
    return null;
  }
}
