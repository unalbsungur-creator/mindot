/**
 * The PNG endpoint behind `/share/[messageId]`'s image share. That page
 * only offers the note on its own, so the mode is always `note_only`. The
 * route itself still accepts `?mode=note_with_surrounding`, so image links
 * generated before the wall option was removed keep working.
 */
export function noteShareImageUrl(messageId: string, formatId: string): string {
  return `/api/share/note/${encodeURIComponent(messageId)}/${encodeURIComponent(formatId)}?mode=note_only`;
}
