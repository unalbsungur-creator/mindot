/**
 * MB-01 "Bu söz kimin?" — whose words a note carries. A note is either the
 * writer's own words (`isQuote: false`, the default for every message
 * written before this existed) or a quote, attributed to a named person or
 * to nobody known (`isQuote: true`, `quoteAuthor: null` — shown as the
 * viewer's own word for "Unknown", so the stored value stays
 * language-free).
 *
 * The one set of rules for the write form, `submitMessageForAuthor`, a
 * published note's revision and a moderator's correction, so client and
 * server always agree; the server checks are the actual boundary.
 */
export const QUOTE_AUTHOR_MAX_LENGTH = 80;

export interface QuoteAttribution {
  isQuote: boolean;
  /** `null` for the writer's own words, and for a quote whose author is unknown. */
  quoteAuthor: string | null;
}

export const OWN_WORDS: QuoteAttribution = { isQuote: false, quoteAuthor: null };

/** What a client sends: the choice itself, the typed name, and the "Unknown" box. */
export interface QuoteAttributionInput {
  isQuote: boolean;
  quoteAuthor?: string | null;
  quoteAuthorUnknown?: boolean;
}

export type QuoteAttributionError = "quote-author-required" | "quote-author-too-long";

/**
 * The form state behind the choice (write form, archive edit dialog,
 * persisted across the Google redirect). `choice` starts `null` on the
 * write form: the writer must pick one explicitly — there is no default.
 */
export interface QuoteAttributionDraft {
  choice: "own" | "quote" | null;
  quoteAuthor: string;
  quoteAuthorUnknown: boolean;
}

/**
 * The stored form of a typed author name: control characters (including
 * line breaks — a name is one line) become spaces, runs of whitespace
 * collapse to one, and the ends are trimmed.
 */
export function normalizeQuoteAuthor(raw: string): string {
  return raw
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Validates and normalizes a client's attribution. Own words always store
 * no author, whatever was typed. A quote needs either a name (at most
 * `QUOTE_AUTHOR_MAX_LENGTH` code points after normalizing) or "Unknown";
 * "Unknown" wins over a typed name, so the stored state is never ambiguous.
 */
export function resolveQuoteAttribution(
  input: QuoteAttributionInput
): { ok: true; attribution: QuoteAttribution } | { ok: false; error: QuoteAttributionError } {
  if (!input.isQuote) return { ok: true, attribution: OWN_WORDS };
  if (input.quoteAuthorUnknown) return { ok: true, attribution: { isQuote: true, quoteAuthor: null } };
  const author = normalizeQuoteAuthor(input.quoteAuthor ?? "");
  if (!author) return { ok: false, error: "quote-author-required" };
  if ([...author].length > QUOTE_AUTHOR_MAX_LENGTH) return { ok: false, error: "quote-author-too-long" };
  return { ok: true, attribution: { isQuote: true, quoteAuthor: author } };
}
