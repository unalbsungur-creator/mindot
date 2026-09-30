/**
 * `users.id` is the sign-in provider's own stable subject. Google accounts
 * use the bare Google `sub` (the original scheme — unchanged, no migration);
 * every other provider is namespaced as `<provider>:<sub>`, so an Apple
 * subject can never be mistaken for, or collide with, a Google one (Google
 * subs are purely numeric), the credentials admin id, or a deleted
 * account's `deleted_…` tombstone.
 */
export function appleUserId(appleSub: string): string {
  return `apple:${appleSub}`;
}
