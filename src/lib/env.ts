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
        new URL(process.env.NODE_ENV === "production" ? PRODUCTION_SITE_URL : "http://localhost:3000")
    );
}

export function getAuthRuntimeConfig() {
    return {
        clientId: optionalEnv("GOOGLE_CLIENT_ID"),
        clientSecret: optionalEnv("GOOGLE_CLIENT_SECRET"),
    };
}
