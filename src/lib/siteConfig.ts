/**
 * MINDOT's public site identity — the values route metadata, Open Graph
 * tags, JSON-LD, the sitemap, and robots.ts should all read from, rather
 * than repeating a literal string in each place. This is fixed brand and
 * production identity, distinct from src/lib/env.ts's runtime environment
 * access (secrets, per-deployment overrides): see getAppUrl() there, which
 * prefers NEXT_PUBLIC_APP_URL / AUTH_URL and only falls back to
 * PRODUCTION_SITE_URL below when neither is set in a production build.
 */

/**
 * The public-facing brand name. The domain's hyphen never appears in
 * visible copy — only in the URL itself (see PRODUCTION_SITE_URL).
 */
export const SITE_NAME = "MINDOT";

export const SITE_TAGLINE = "A living wall of thought";

/**
 * Concise, accurate product description — no exaggerated marketing claims.
 * Used as the default metadata description and in JSON-LD.
 */
export const SITE_DESCRIPTION =
  "MINDOT is a place to leave a thought as a note — shared anonymously or by name, reviewed by a person before it becomes public, and kept as a lasting memory.";

/**
 * The intended production origin. Not a value to import and use directly
 * elsewhere — every route that needs an absolute URL should call
 * getAppUrl() (src/lib/env.ts), which only falls back to this constant in
 * a production environment where neither NEXT_PUBLIC_APP_URL nor AUTH_URL
 * is set.
 */
export const PRODUCTION_SITE_URL = "https://mind-ot.com";
