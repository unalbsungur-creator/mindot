const STORAGE_KEY = "mindot:anon-id:v1";

/**
 * EPIC: Message Like System. A random id generated once per browser and
 * kept in localStorage — the *only* identity an unauthenticated visitor
 * has. This is explicitly not a security mechanism: clearing site data,
 * using a private window, or switching browsers all produce a new id.
 * It exists purely so the same browser clicking "like" on the same
 * message twice reads as one like at the database level (see
 * message_likes' unique index) — a reasonable UX-level dedup, not a
 * fraud-proof one. Never present this as verified/authenticated identity
 * anywhere it's read.
 *
 * Wrapped in try/catch like every other localStorage read in this
 * codebase (private-mode/blocked storage never crashes the app — see
 * features/onboarding/lib/state.ts for the same pattern) — falls back to
 * a fresh, non-persisted id for that one call, which just means that
 * particular click doesn't dedupe against a future one in the same
 * browser.
 */
export function getAnonymousId(): string {
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    window.localStorage.setItem(STORAGE_KEY, fresh);
    return fresh;
  } catch {
    return crypto.randomUUID();
  }
}
