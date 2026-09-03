/**
 * The content-responsibility consent a writer must give before a thought
 * can reach `submitMessage` — see "Mandatory content-responsibility
 * consent" in CLAUDE.md. This version string is the single source of
 * truth for which wording a given acceptance refers to: the actual
 * copy lives in `dictionary.write.consentText` (one real translation per
 * locale, not machine-translated), never duplicated here or anywhere
 * else. Bump this if that copy's legal meaning changes materially —
 * `WriteThoughtForm` only accepts a consent whose version matches this
 * constant exactly (see `submitMessage`'s server-side check), so bumping
 * it naturally re-requires every writer to re-confirm under the new text,
 * the same "orphan the old value" versioning approach already used by
 * `src/features/onboarding/lib/state.ts`'s storage key.
 */
export const CONTENT_CONSENT_VERSION = "1.0";
