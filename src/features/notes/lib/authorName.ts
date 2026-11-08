/**
 * MB-01: an anonymous note stores the literal, language-free placeholder
 * "anonymous" as its author name (`submitMessage`, account deletion, the
 * quote backfill). Wherever a card draws "— {name}", that placeholder is
 * shown as the viewer's own word for it ("anonim", "anonyme"…); a real name
 * is shown as written.
 */
export const ANONYMOUS_PLACEHOLDER = "anonymous";

export function displayAuthorName(authorName: string, anonymousLabel: string): string {
  return authorName.trim() === ANONYMOUS_PLACEHOLDER ? anonymousLabel : authorName;
}

/**
 * The `authorName` a public card gets from the board contract: a named
 * note's display name, or — for an anonymous note, whose `author` is `null`
 * by the privacy contract — the placeholder, so the card reads "— anonim"
 * instead of a bare "—". (The owner's own archive passes "" on purpose: no
 * byline there.)
 */
export function publicAuthorName(author: { displayName: string } | null | undefined): string {
  return author?.displayName ?? ANONYMOUS_PLACEHOLDER;
}
