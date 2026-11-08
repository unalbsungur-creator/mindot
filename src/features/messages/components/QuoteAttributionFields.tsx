"use client";

import { cn } from "@/lib/cn";
import type { Dictionary } from "@/i18n/translations";
import { useLocale } from "@/i18n/LocaleProvider";
import {
  normalizeQuoteAuthor,
  QUOTE_AUTHOR_MAX_LENGTH,
  type QuoteAttributionDraft,
  type QuoteAttributionError,
  type QuoteAttributionInput,
} from "../lib/quoteAttribution";

export type { QuoteAttributionDraft } from "../lib/quoteAttribution";

export const EMPTY_QUOTE_ATTRIBUTION: QuoteAttributionDraft = { choice: null, quoteAuthor: "", quoteAuthorUnknown: false };

/** The draft as the server input — only meaningful once `choice` is set. */
export function toQuoteAttributionInput(draft: QuoteAttributionDraft): QuoteAttributionInput {
  return { isQuote: draft.choice === "quote", quoteAuthor: draft.quoteAuthor, quoteAuthorUnknown: draft.quoteAuthorUnknown };
}

/** The draft for a stored attribution (the archive's edit dialog starts from the live note). */
export function quoteAttributionDraftFor(isQuote: boolean, quoteAuthor: string | null): QuoteAttributionDraft {
  if (!isQuote) return { choice: "own", quoteAuthor: "", quoteAuthorUnknown: false };
  return { choice: "quote", quoteAuthor: quoteAuthor ?? "", quoteAuthorUnknown: quoteAuthor === null };
}

/** Client-side mirror of `resolveQuoteAttribution` — the server re-checks; this only explains a disabled submit. */
export function quoteAttributionDraftError(draft: QuoteAttributionDraft): "choice-required" | QuoteAttributionError | null {
  if (draft.choice === null) return "choice-required";
  if (draft.choice === "own" || draft.quoteAuthorUnknown) return null;
  const author = normalizeQuoteAuthor(draft.quoteAuthor);
  if (!author) return "quote-author-required";
  if ([...author].length > QUOTE_AUTHOR_MAX_LENGTH) return "quote-author-too-long";
  return null;
}

export function quoteAttributionErrorMessage(
  error: "choice-required" | QuoteAttributionError,
  t: Dictionary["quote"]
): string {
  if (error === "choice-required") return t.errorChoiceRequired;
  if (error === "quote-author-required") return t.errorAuthorRequired;
  return t.errorAuthorTooLong.replace("{max}", String(QUOTE_AUTHOR_MAX_LENGTH));
}

/**
 * The choice ("Benim sözüm" / "Başkasının sözü (alıntı)") and, for a
 * quote, the required "Sözün sahibi" field with its "Bilinmiyor" box.
 * `showChoice={false}` renders only the author part — a moderator's
 * correction, which never turns own words into a quote or back.
 * `showError` holds the inline message back until the writer has tried
 * to continue, so an untouched form isn't already red.
 */
export function QuoteAttributionFields({
  value,
  onChange,
  idPrefix,
  showChoice = true,
  showError = true,
}: {
  value: QuoteAttributionDraft;
  onChange: (next: QuoteAttributionDraft) => void;
  idPrefix: string;
  showChoice?: boolean;
  showError?: boolean;
}) {
  const { dictionary } = useLocale();
  const t = dictionary.quote;
  const error = quoteAttributionDraftError(value);
  const authorError = error === "quote-author-required" || error === "quote-author-too-long" ? error : null;
  const authorErrorId = `${idPrefix}-quote-author-error`;

  const authorFields = (
    <div className="flex flex-col gap-2">
      <label htmlFor={`${idPrefix}-quote-author`} className="text-sm font-medium text-navy">
        {t.authorLabel}
      </label>
      <input
        id={`${idPrefix}-quote-author`}
        type="text"
        value={value.quoteAuthor}
        onChange={(event) => onChange({ ...value, quoteAuthor: event.target.value })}
        disabled={value.quoteAuthorUnknown}
        required={!value.quoteAuthorUnknown}
        maxLength={QUOTE_AUTHOR_MAX_LENGTH}
        placeholder={t.authorPlaceholder}
        aria-invalid={showError && authorError !== null}
        aria-describedby={showError && authorError ? authorErrorId : undefined}
        // 16px: below it Mobile Safari zooms the page on focus (see #displayName in WriteThoughtForm).
        className="w-full rounded-md border border-border bg-surface p-2.5 text-[16px] text-ink shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange disabled:cursor-not-allowed disabled:opacity-60"
      />
      <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={value.quoteAuthorUnknown}
          onChange={(event) => onChange({ ...value, quoteAuthorUnknown: event.target.checked })}
          className="h-4 w-4 shrink-0 cursor-pointer rounded border-border accent-orange focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
        />
        {t.unknownAuthorOption}
      </label>
      {showError && authorError && (
        <p id={authorErrorId} className="text-xs text-red-600">
          {quoteAttributionErrorMessage(authorError, t)}
        </p>
      )}
    </div>
  );

  if (!showChoice) return authorFields;

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium text-navy">{t.attributionLegend}</legend>
      <div role="radiogroup" aria-label={t.attributionLegend} aria-required="true" className="grid gap-3 sm:grid-cols-2">
        <ChoiceOption
          selected={value.choice === "own"}
          onSelect={() => onChange({ ...value, choice: "own" })}
          title={t.ownWordsLabel}
          hint={t.ownWordsHint}
        />
        <ChoiceOption
          selected={value.choice === "quote"}
          onSelect={() => onChange({ ...value, choice: "quote" })}
          title={t.quoteLabel}
          hint={t.quoteHint}
        />
      </div>
      {showError && error === "choice-required" && <p className="text-xs text-red-600">{t.errorChoiceRequired}</p>}
      {value.choice === "quote" && <div className="pt-1">{authorFields}</div>}
    </fieldset>
  );
}

/** One labeled option of a two-way choice — the write form's identity choice uses it too. */
export function ChoiceOption({
  selected,
  onSelect,
  title,
  hint,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex flex-col items-start gap-1 rounded-md border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange",
        selected ? "border-navy bg-navy/5" : "border-border bg-surface hover:border-navy/40"
      )}
    >
      <span className="text-sm font-medium text-navy">{title}</span>
      <span className="text-xs text-ink-soft">{hint}</span>
    </button>
  );
}
