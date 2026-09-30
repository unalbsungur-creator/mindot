/**
 * What MINDOT takes from a Sign in with Apple profile. `sub` and `email`
 * come from Apple's id_token, which Auth.js has already verified (issuer,
 * audience, signature, nonce). `name` does not: Apple sends it only on the
 * first consent, as an unsigned `user` form field next to the token — so it
 * is treated as untrusted display text (trimmed, control characters
 * removed, length-capped), and missing on every later sign-in.
 *
 * Deliberately never falls back to the email for a display name (Auth.js's
 * default Apple profile does): with "Hide My Email" that would publish a
 * private-relay address as the author of a named note.
 */
export interface AppleIdentity {
  sub: string;
  /** Possibly a private-relay address (…@privaterelay.appleid.com) — used as a contact email, never displayed as a name. */
  email: string | null;
  name: string | null;
}

const MAX_NAME_LENGTH = 80;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
}

export function parseAppleProfile(profile: unknown): AppleIdentity | null {
  if (typeof profile !== "object" || profile === null) return null;
  const claims = profile as Record<string, unknown>;

  const sub = typeof claims.sub === "string" ? claims.sub.trim() : "";
  if (!sub) return null;

  const rawEmail = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
  const email = EMAIL_PATTERN.test(rawEmail) ? rawEmail : null;

  const user = typeof claims.user === "object" && claims.user !== null ? (claims.user as Record<string, unknown>) : null;
  const nameParts = user && typeof user.name === "object" && user.name !== null ? (user.name as Record<string, unknown>) : null;
  const fullName = [cleanName(nameParts?.firstName), cleanName(nameParts?.lastName)].filter(Boolean).join(" ").slice(0, MAX_NAME_LENGTH).trim();

  return { sub, email, name: fullName || null };
}
