/**
 * Picks a small, deterministic subset of a personal wall's notes for a
 * branded share card — never all of them (EPIC 009 section 10: "do not
 * render hundreds of notes into one image").
 *
 * Chosen strategy: evenly-spaced indices across the *whole* ordered
 * history, oldest to newest, rather than simply the most recent N. A
 * personal wall is framed as "a collection of thoughts that once existed
 * in your mind" — a spread across time reads as a reflective retrospective;
 * "just the last few" reads as a recency feed, which is closer to the
 * social-timeline feel this EPIC explicitly avoids. Both are equally
 * deterministic; this one better fits the product's own framing.
 *
 * Deterministic and stable: for the same input array (already ordered by
 * `listPublicByAuthor`'s `createdAt ASC, id` — Postgres ties `createdAt`
 * ordering to insertion order for practical purposes, and `id`s are
 * UUIDs assigned once at creation) the same indices are picked every
 * time — no randomness, so a shared card never changes between refreshes
 * for an unchanged dataset.
 */
export function curateWallSelection<T>(orderedItems: T[], max: number): T[] {
  if (orderedItems.length <= max) return orderedItems;
  if (max <= 0) return [];
  if (max === 1) return [orderedItems[0]];

  const picked: T[] = [];
  const lastIndex = orderedItems.length - 1;
  for (let i = 0; i < max; i++) {
    const index = Math.round((i * lastIndex) / (max - 1));
    picked.push(orderedItems[index]);
  }
  return picked;
}
