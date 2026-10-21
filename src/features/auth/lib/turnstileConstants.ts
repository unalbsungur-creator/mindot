/**
 * Turnstile constants with NO imports — safe to pull into a Client Component
 * (the admin login form needs the action name). The server-only verification
 * logic lives in ./turnstile, which must never reach the client bundle because
 * it transitively imports server-only config (next/headers via @/lib/env).
 */

/** The `action` the admin login widget renders with and siteverify must echo back. */
export const TURNSTILE_ADMIN_LOGIN_ACTION = "admin-login";

/** Cloudflare documents the response token as at most 2048 characters. */
export const MAX_TURNSTILE_TOKEN_LENGTH = 2048;
