import { getNoteTemplate } from "../config/templates";

/**
 * Quote marks a writer may wrap a quotation in: straight ", English “ ”,
 * French « », German „ (closed with “).
 */
const QUOTE_MARKS = "\"“”«»„";
const WRAPPED = new RegExp(`^\\s*[${QUOTE_MARKS}]+\\s*([\\s\\S]*?)\\s*[${QUOTE_MARKS}]+([.!?…]*)\\s*$`);
const LEADING = new RegExp(`^\\s*[${QUOTE_MARKS}]+\\s*`);
const TRAILING = new RegExp(`\\s*[${QUOTE_MARKS}]+([.!?…]*)\\s*$`);
const ANY_MARK = new RegExp(`[${QUOTE_MARKS}]`);

/**
 * `content` without the quote marks at its very start and end — for a card
 * whose artwork already prints decorative ones (`decorativeQuoteMarks`), so
 * "“Hayat güzel.”" is not drawn inside a second pair. Display only: the
 * stored message is never changed.
 *
 * Only marks that wrap the whole text go. If a mark is left inside the text
 * (`"Hayat" dedi.`, `"a" ve "b"`), the outer ones belong to that structure
 * and the text is returned unchanged. Sentence punctuation after a closing
 * mark (`"Hayat güzel".`) is kept. Text that is nothing but marks is
 * returned unchanged rather than drawn as an empty card.
 */
export function stripWrappingQuoteMarks(content: string): string {
  const both = WRAPPED.exec(content);
  let inner: string | null = null;
  if (both) {
    inner = both[1] + both[2];
  } else if (LEADING.test(content)) {
    inner = content.replace(LEADING, "");
  } else if (TRAILING.test(content)) {
    inner = content.replace(TRAILING, "$1");
  }
  if (inner === null || inner.trim() === "" || ANY_MARK.test(inner)) return content;
  return inner;
}

/** The text a card actually draws for `content` on `templateId` — the one place display-only text rules live. */
export function noteDisplayContent(templateId: string, content: string): string {
  return getNoteTemplate(templateId).decorativeQuoteMarks ? stripWrappingQuoteMarks(content) : content;
}
