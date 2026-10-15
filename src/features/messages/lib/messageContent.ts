/**
 * The stored form of a thought's text, applied by the server to both a new
 * message (`submitMessageForAuthor`) and a published note's revision
 * (`submitMessageRevisionForAuthor`) before any emptiness or length check:
 *
 * - line breaks become `\n` (`\r\n`, a lone `\r`, and U+2028/U+2029 too),
 * - a line holding only spaces/tabs counts as blank, and trailing
 *   spaces/tabs on every line are dropped,
 * - two or more blank lines in a row collapse to one (at most `\n\n`),
 * - leading and trailing whitespace of the whole text is trimmed.
 *
 * The writer's own line breaks are kept — every renderer shows them
 * (`whitespace-pre-line` in Note.tsx, `whiteSpace: "pre-line"` in the share
 * card, paragraphs in the PDF's `wrapTextToLines`). Normalizing only ever
 * shortens the text, so it never pushes a message over its card's limit.
 */
export function normalizeMessageContent(raw: string): string {
  return raw
    .replace(/\r\n?|[\u2028\u2029]/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
