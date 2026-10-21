/**
 * The trusted client IP for the admin Turnstile check (GÖREV 30 / P1),
 * extracted as a pure helper (GÖREV 44) so it can be unit-tested without
 * NextAuth, next/headers, the database, or any network.
 *
 * Only Cloudflare's own `CF-Connecting-IP` is read — never
 * `X-Forwarded-For` / `X-Real-IP`, which a client can forge. The selected
 * value (or `null` when the header is absent) is forwarded to siteverify as
 * `remoteip` exactly as before. No trimming, normalization or validation is
 * applied here: this mirrors the prior `headers().get("CF-Connecting-IP")`
 * behavior byte-for-byte, so an empty or malformed header value is returned
 * unchanged — the security decision never depends on it (it is an auxiliary
 * siteverify signal, not a gate).
 *
 * The request-scope error handling (next/headers throwing outside a request)
 * stays with the caller in features/auth/auth.ts; this helper takes an
 * already-resolved `Headers` and cannot throw.
 */

/** The one header MINDOT trusts for the client IP — set by the Cloudflare edge, not forgeable by the client. */
export const TRUSTED_CLIENT_IP_HEADER = "CF-Connecting-IP";

/**
 * Select the trusted client IP from request headers: the Cloudflare
 * `CF-Connecting-IP` value, or `null` when it is absent. Forgeable
 * forwarding headers (`X-Forwarded-For`, `X-Real-IP`) are never consulted.
 */
export function pickTrustedRemoteIp(headers: Headers): string | null {
  return headers.get(TRUSTED_CLIENT_IP_HEADER);
}
