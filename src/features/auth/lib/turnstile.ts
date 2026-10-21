import { resolveAppEnvironment } from "@/lib/appEnvironment";
import { optionalEnv } from "@/lib/env";
import { PRODUCTION_SITE_URL, STAGING_SITE_URL } from "@/lib/siteConfig";
import { MAX_TURNSTILE_TOKEN_LENGTH, TURNSTILE_ADMIN_LOGIN_ACTION } from "./turnstileConstants";

// Re-exported so existing server-side importers keep a single entry point;
// the client imports these from ./turnstileConstants directly (this module is
// server-only — it pulls next/headers via @/lib/env).
export { MAX_TURNSTILE_TOKEN_LENGTH, TURNSTILE_ADMIN_LOGIN_ACTION };

/**
 * Cloudflare Turnstile server-side verification for the admin login
 * (GÖREV 30 / P1). This module is the whole trust decision about a
 * Turnstile token; it is deliberately free of auth/database concerns so it
 * can be unit-tested in isolation with an injected `fetch`.
 *
 * It is reached only through `verifyAdminCredentials` (features/auth/service.ts),
 * which both admin sign-in paths converge on — the `/admin/login` Server
 * Action and the raw `POST /api/auth/callback/credentials` handler — so a
 * single check here covers both. Google/Apple OAuth never touch it.
 *
 * Everything fails CLOSED: a missing/oversized token, a missing secret, a
 * network error, a timeout, a 5xx, a non-JSON body, `success: false`, or a
 * mismatched `action`/`hostname` all return "not verified". There is no
 * retry (a retried siteverify would double-spend the one-time token anyway),
 * and neither the token nor the secret is ever logged.
 */

export const TURNSTILE_SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const SITEVERIFY_TIMEOUT_MS = 5_000;

export type TurnstileRejectionReason =
  | "no-token"
  | "token-too-long"
  | "secret-missing"
  | "request-failed"
  | "http-error"
  | "malformed-response"
  | "unsuccessful"
  | "action-mismatch"
  | "hostname-mismatch";

export type TurnstileVerification = { ok: true } | { ok: false; reason: TurnstileRejectionReason };

export interface TurnstileVerifyOptions {
  /** The Turnstile secret key. `undefined` → fail closed with `secret-missing`. */
  secret: string | undefined;
  /** Hostnames the solved challenge is allowed to have come from (environment-specific). */
  allowedHostnames: readonly string[];
  /** The expected `action`; defaults to the admin-login action. */
  expectedAction?: string;
  /** Trusted client IP (Cloudflare `CF-Connecting-IP` only), forwarded to siteverify when present. */
  remoteIp?: string | null;
  /** Injectable for tests; defaults to global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Injectable for tests; defaults to {@link SITEVERIFY_TIMEOUT_MS}. */
  timeoutMs?: number;
}

interface SiteverifyResponse {
  success?: unknown;
  action?: unknown;
  hostname?: unknown;
  "error-codes"?: unknown;
}

/**
 * Verify a Turnstile token against Cloudflare siteverify. Pure apart from the
 * injected `fetch` — no env, no request context — so every branch is testable.
 */
export async function verifyTurnstileToken(
  token: string,
  options: TurnstileVerifyOptions
): Promise<TurnstileVerification> {
  // Cheap, network-free rejections first — a missing/oversized token or a
  // missing secret must never reach Cloudflare.
  if (!token) return { ok: false, reason: "no-token" };
  if (token.length > MAX_TURNSTILE_TOKEN_LENGTH) return { ok: false, reason: "token-too-long" };
  if (!options.secret) return { ok: false, reason: "secret-missing" };

  const expectedAction = options.expectedAction ?? TURNSTILE_ADMIN_LOGIN_ACTION;
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? SITEVERIFY_TIMEOUT_MS;

  const body = new URLSearchParams();
  body.set("secret", options.secret);
  body.set("response", token);
  // Only the trusted edge-provided client IP is ever forwarded; the caller is
  // responsible for never passing an untrusted X-Forwarded-For value here.
  if (options.remoteIp) body.set("remoteip", options.remoteIp);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetchImpl(TURNSTILE_SITEVERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: controller.signal,
    });
  } catch {
    // Network failure, DNS error, or the timeout abort firing — no retry.
    return { ok: false, reason: "request-failed" };
  } finally {
    clearTimeout(timer);
  }

  // Any non-2xx (Cloudflare 5xx included) is a fail-closed outcome.
  if (!response.ok) return { ok: false, reason: "http-error" };

  let data: SiteverifyResponse;
  try {
    data = (await response.json()) as SiteverifyResponse;
  } catch {
    return { ok: false, reason: "malformed-response" };
  }
  if (!data || typeof data !== "object") return { ok: false, reason: "malformed-response" };

  // `success: false` covers an invalid, expired, or already-used
  // (timeout-or-duplicate) token — all rejected identically.
  if (data.success !== true) return { ok: false, reason: "unsuccessful" };
  if (typeof data.action !== "string" || data.action !== expectedAction) {
    return { ok: false, reason: "action-mismatch" };
  }
  if (typeof data.hostname !== "string" || !options.allowedHostnames.includes(data.hostname)) {
    return { ok: false, reason: "hostname-mismatch" };
  }
  return { ok: true };
}

/**
 * The per-environment Turnstile configuration, read at call time (never at
 * module load): the secret key from `TURNSTILE_SECRET_KEY`, and the single
 * hostname a solved challenge is allowed to have come from — production vs.
 * staging are kept strictly apart, and development accepts localhost only.
 */
export function adminLoginTurnstileRuntime(): { secret: string | undefined; allowedHostnames: string[] } {
  const appEnv = resolveAppEnvironment();
  const allowedHostnames =
    appEnv === "production"
      ? [new URL(PRODUCTION_SITE_URL).hostname]
      : appEnv === "staging"
        ? [new URL(STAGING_SITE_URL).hostname]
        : ["localhost", "127.0.0.1"];
  return { secret: optionalEnv("TURNSTILE_SECRET_KEY"), allowedHostnames };
}

/**
 * The default admin-login Turnstile check wired into `verifyAdminCredentials`:
 * resolves the runtime config, verifies once, and collapses the detailed
 * result to a boolean for the security boundary. The rejection reason is
 * logged (never the token or secret) for operability.
 */
export async function verifyAdminLoginTurnstile(token: string, remoteIp: string | null): Promise<boolean> {
  const { secret, allowedHostnames } = adminLoginTurnstileRuntime();
  const result = await verifyTurnstileToken(token, {
    secret,
    allowedHostnames,
    expectedAction: TURNSTILE_ADMIN_LOGIN_ACTION,
    remoteIp,
  });
  if (!result.ok) {
    console.warn(`[auth] admin Turnstile rejected: ${result.reason}`);
  }
  return result.ok;
}
