import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Opaque refresh tokens for the native apps: `<sid>.<secret>`, where `sid`
 * is the mobile_sessions row id (a server-generated UUID) and `secret` is 32
 * random bytes, base64url. Only SHA-256(secret) is ever stored — never the
 * token, never the secret. Carrying `sid` lets a refresh look the session
 * up by primary key and then compare the secret against both the current
 * and the previous hash, without an index on the previous one.
 *
 * Pure: no database, no environment.
 */

const SECRET_BYTES = 32;
/** base64url of 32 bytes, unpadded. */
const SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const SID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;

export interface ParsedRefreshToken {
  sid: string;
  secret: string;
}

function isValidSid(sid: unknown): sid is string {
  return typeof sid === "string" && SID_PATTERN.test(sid);
}

/** SHA-256 of the secret, lowercase hex. Deterministic. */
export function hashRefreshSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

/** A new token for session `sid`, plus the hash to store for it. The token itself is shown to the client once and never stored. */
export function generateRefreshToken(sid: string): { token: string; secretHash: string } {
  if (!isValidSid(sid)) throw new Error("A refresh token needs a server-generated session id.");
  const secret = randomBytes(SECRET_BYTES).toString("base64url");
  return { token: `${sid}.${secret}`, secretHash: hashRefreshSecret(secret) };
}

/** `null` for anything that isn't exactly `<uuid>.<43-char base64url secret>`. */
export function parseRefreshToken(token: unknown): ParsedRefreshToken | null {
  if (typeof token !== "string" || !token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [sid, secret] = parts;
  if (!isValidSid(sid) || !SECRET_PATTERN.test(secret)) return null;
  return { sid, secret };
}

/** Whether `secret` hashes to `expectedHash`, compared in constant time. A malformed stored hash never matches. */
export function compareRefreshSecret(secret: string, expectedHash: string): boolean {
  if (typeof secret !== "string" || typeof expectedHash !== "string" || !HASH_PATTERN.test(expectedHash)) return false;
  const actual = Buffer.from(hashRefreshSecret(secret), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
