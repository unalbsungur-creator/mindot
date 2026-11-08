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
