/**
 * Security pack 2b: the two pre-screen markers the admin UI and the alert
 * e-mail act on, stored in `messages.ai_moderation_categories`. No imports —
 * safe in client components (the moderation queue).
 */

/** The model reported a possible self-harm / suicide risk: shown as PRIORITY, sorted first. */
export const CRISIS_CATEGORY = "crisis";
/** The pre-screen couldn't produce an answer (timeout, error, invalid output). */
export const PRESCREEN_UNAVAILABLE = "prescreen_unavailable";

export function isPriorityPrescreen(categories: readonly string[] | null | undefined): boolean {
  return Array.isArray(categories) && categories.includes(CRISIS_CATEGORY);
}

export function isPrescreenUnavailable(categories: readonly string[] | null | undefined): boolean {
  return Array.isArray(categories) && categories.includes(PRESCREEN_UNAVAILABLE);
}

/** Priority cards first; otherwise the given order is kept (stable). */
export function priorityFirst<T extends { aiModerationCategories: readonly string[] | null }>(items: readonly T[]): T[] {
  return [...items].sort(
    (a, b) => Number(isPriorityPrescreen(b.aiModerationCategories)) - Number(isPriorityPrescreen(a.aiModerationCategories))
  );
}
