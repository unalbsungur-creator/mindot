import { headers } from "next/headers";
import { PRODUCTION_SITE_URL } from "./siteConfig";

/**
 * Server-side environment access. Importing this module never requires a
 * runtime service to be configured, so static builds remain database- and
 * credential-independent. Feature entry points call `requireRuntimeEnv`
 * only when they actually need a value.
 */
export type RuntimeEnvName =
    | "AUTH_SECRET"
    | "AUTH_URL"
    | "DATABASE_URL"
    | "GOOGLE_CLIENT_ID"
    | "GOOGLE_CLIENT_SECRET"
    | "NEXT_PUBLIC_APP_URL"
    // EPIC: E-mail Gönderimi İçin Güvenli Mimari — only read when the
    // "resend" email provider is actually selected (EMAIL_PROVIDER=resend,
    // read directly via process.env like AI_MODERATION_PROVIDER — see
    // features/email/service.ts); the default dev-fallback provider never
    // touches these, so a deployment with no email provider configured is
    // unaffected. See features/email/providers/resend.ts.
    | "RESEND_API_KEY"
    | "EMAIL_FROM";

export class RuntimeConfigurationError extends Error {
    readonly code = "RUNTIME_CONFIGURATION_ERROR";

    constructor(readonly variable: RuntimeEnvName) {
        super(`Required runtime configuration is missing: ${variable}.`);
        this.name = "RuntimeConfigurationError";
    }
}

export function optionalEnv(name: RuntimeEnvName): string | undefined {
    const value = process.env[name]?.trim();
    return value || undefined;
}

export function requireRuntimeEnv(name: RuntimeEnvName): string {
    const value = optionalEnv(name);
    if (!value) throw new RuntimeConfigurationError(name);
    return value;
}

/**
 * EPIC: Make Database Dependency Safe for Cloudflare Build. A cheap,
 * non-throwing check for callers that must decide *whether* to touch the
 * database at all before doing so — the one legitimate case today is
 * app/page.tsx's homepage, which uses ISR (`export const revalidate`) and
 * is therefore prerendered at `next build` time, when a deployment
 * target's real DATABASE_URL may not exist yet (e.g. an initial
 * Cloudflare build, before the production database is configured).
 *
 * This does NOT weaken `requireRuntimeEnv`/`getDb()` in any way — every
 * route that genuinely requires the database (write, board, admin/*, me,
 * moderation actions, etc.) still calls those directly and still throws
 * exactly as before if DATABASE_URL is missing at the time a real request
 * reaches them. This function only lets a caller check first, so it can
 * skip the database entirely (never call `getDb()`, never attempt a
 * connection) rather than initializing something that would immediately
 * fail — see `B` in that EPIC's requirements: don't eagerly require the
 * database unless the operation actually needs it.
 */
export function isDatabaseConfigured(): boolean {
    return optionalEnv("DATABASE_URL") !== undefined;
}

function validAbsoluteUrl(value: string | undefined): URL | null {
    if (!value) return null;
    try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:" ? url : null;
    } catch {
        return null;
    }
}

/**
 * Canonical public origin — the single function every route/metadata/
 * sitemap/robots/JSON-LD consumer should call for an absolute site URL.
 * `NEXT_PUBLIC_APP_URL` is the intended public site URL variable;
 * `AUTH_URL` (Auth.js's own canonical origin) remains a compatibility
 * fallback for deployments that only set that one, since in this
 * single-domain project they're normally identical. Only when neither is
 * set does this fall back to a hardcoded value — `PRODUCTION_SITE_URL` in
 * production (the domain string exists in exactly one place, see
 * src/lib/siteConfig.ts), or localhost in development, so a missing
 * production env var never silently generates a localhost URL, and local
 * dev never accidentally targets the production domain.
 */
export function getAppUrl(): URL {
    return (
        validAbsoluteUrl(optionalEnv("NEXT_PUBLIC_APP_URL")) ??
        validAbsoluteUrl(optionalEnv("AUTH_URL")) ??
        new URL(process.env.NODE_ENV === "production" ? PRODUCTION_SITE_URL : "http://localhost:3200")
    );
}

/**
 * EPIC 025: the origin the CURRENT request actually arrived on — read from
 * that request's own `Host`/forwarded headers, never a statically
 * configured value. This is deliberately a *different* function from
 * `getAppUrl()`, not a change to it: `getAppUrl()` remains the canonical,
 * static site origin every non-request-scoped consumer (`robots.ts`,
 * `sitemap.ts`, JSON-LD, root `metadataBase`) should keep using — those
 * must always declare the one true public domain, regardless of which
 * host a particular request happened to use. This function exists only
 * for the opposite, narrower need: a page whose job is to reflect *how
 * the visitor actually reached it* (see `/share/[messageId]`, where the
 * generated Facebook-share URL must match whatever host is actually
 * serving the page a phone on the same LAN just requested — a local dev
 * machine has no single "canonical" LAN address, so `getAppUrl()`'s
 * static fallback can never be correct for that case).
 *
 * `x-forwarded-host`/`x-forwarded-proto` take priority over the plain
 * `host` header, since this project's actual deployment target
 * (Cloudflare, via `@opennextjs/cloudflare`) sets those to the real
 * public-facing values through its proxy — the same precedence
 * `getAppUrl()`'s own doc comment already establishes between
 * `NEXT_PUBLIC_APP_URL` and `AUTH_URL` for "prefer the more
 * specifically-intended source." Protocol defaults to `"http"` only when
 * no `x-forwarded-proto` is present — true for a direct, unproxied `next
 * dev` connection (this project never terminates TLS locally) — rather
 * than guessing `"https"`, so a local/LAN request is never misrepresented
 * as secure. Returns `null` (never throws) when no host header is present
 * at all, or when called outside a request context — the caller is
 * expected to fall back to `getAppUrl()` in that case, exactly as
 * `getAppUrl()` itself falls back to a hardcoded value when its own env
 * vars are unset.
 */
export async function getRequestOrigin(): Promise<URL | null> {
    try {
        const headerList = await headers();
        const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
        if (!host) return null;
        const protocol = headerList.get("x-forwarded-proto") ?? "http";
        return validAbsoluteUrl(`${protocol}://${host}`);
    } catch {
        return null;
    }
}

export function getAuthRuntimeConfig() {
    return {
        clientId: optionalEnv("GOOGLE_CLIENT_ID"),
        clientSecret: optionalEnv("GOOGLE_CLIENT_SECRET"),
    };
}
