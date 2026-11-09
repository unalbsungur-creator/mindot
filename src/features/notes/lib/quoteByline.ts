import type { Dictionary } from "@/i18n/translations";

/**
 * MB-01: the two text lines a quote card shows, shared by the DOM card
 * (`CardByline`), the share image and the PDF (`MemoryNoteCard`), so all
 * of them word it the same way.
 *
 * - `authorLine`: "— {quote author}", or "— {Unknown}" in the given language
 *   for `null`. `null` for an empty string: a quote whose author the writer
 *   hasn't entered yet (the write preview) shows no author line at all.
 * - `sharedByLine`: "shared by {name}" — the anonymous placeholder
 *   ("anonymous" as stored, or no name at all) reads as the language's own
 *   word for anonymous. `null` only when the caller passes an empty string
 *   on purpose (the owner's archive draws no byline name).
 */
export interface QuoteBylineLines {
  authorLine: string | null;
  sharedByLine: string | null;
}

export function quoteBylineLines(
  quoteAuthor: string | null | undefined,
  sharerName: string | null,
  t: Pick<Dictionary["quote"], "unknownAuthor" | "sharedBy" | "anonymousSharer">
): QuoteBylineLines {
  const authorLine = quoteAuthor === "" ? null : `— ${quoteAuthor?.trim() || t.unknownAuthor}`;
  if (sharerName === "") return { authorLine, sharedByLine: null };
  const name = !sharerName || sharerName === "anonymous" ? t.anonymousSharer : sharerName;
  return { authorLine, sharedByLine: t.sharedBy.replace("{name}", name) };
}
