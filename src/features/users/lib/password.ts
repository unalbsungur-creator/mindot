import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

/**
 * EPIC 030: password hashing for the one credentials-capable account
 * (admin). Deliberately Node's built-in `crypto.scrypt` rather than a new
 * dependency (no bcrypt/argon2 exists anywhere in this project's
 * package.json) — scrypt is a memory-hard, OWASP-recommended KDF already
 * available with zero new install, matching this codebase's general
 * preference for reusing what's already there (see db:verify's own "no new
 * dependency" precedent).
 *
 * Stored as a single self-describing string — "scrypt:<saltHex>:<hashHex>"
 * — rather than separate columns, so a future algorithm change only needs a
 * new prefix, not a schema migration.
 */
const scryptAsync = promisify(scrypt);
const SALT_BYTES = 16;
const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES).toString("hex");
  const derivedKey = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return `scrypt:${salt}:${derivedKey.toString("hex")}`;
}

/**
 * Constant-time comparison via `timingSafeEqual` — never a plain `===` on
 * the derived key, which would leak timing information about how many
 * leading bytes matched.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, hashHex] = parts;
  const storedKey = Buffer.from(hashHex, "hex");
  const derivedKey = (await scryptAsync(password, salt, storedKey.length)) as Buffer;
  if (derivedKey.length !== storedKey.length) return false;
  return timingSafeEqual(derivedKey, storedKey);
}
