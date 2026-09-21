const STORAGE_KEY = "mindot:anon-id:v1";

/**
 * `crypto.randomUUID` only exists in a secure context (HTTPS, or
 * `http://localhost`) — a plain-HTTP LAN origin like
 * `http://192.168.1.x:3200` is neither, so the browser exposes no
 * `randomUUID` there at all. Falls back to building the same UUID v4
 * shape by hand from `crypto.getRandomValues` (still a real CSPRNG, just
 * not gated to secure contexts), and only as a last resort to
 * `Math.random` — non-cryptographic, but this id is already documented
 * below as non-security-critical, so a weaker RNG here changes nothing
 * about what the id is trusted for. Either fallback keeps the exact
 * `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx` shape `crypto.randomUUID` itself
 * produces, so nothing downstream (storage, the reports table) sees a
 * different id format.
 */
function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (placeholder) => {
    const random = (Math.random() * 16) | 0;
    const value = placeholder === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

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
    const fresh = generateId();
    window.localStorage.setItem(STORAGE_KEY, fresh);
    return fresh;
  } catch {
    return generateId();
  }
}
