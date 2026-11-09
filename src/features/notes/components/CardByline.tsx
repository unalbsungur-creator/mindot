"use client";

import { defaultLocale } from "@/i18n/config";
import { useOptionalLocale } from "@/i18n/LocaleProvider";
import { getDictionary } from "@/i18n/translations";
import { cn } from "@/lib/cn";
import { BYLINE_GAP, BYLINE_LINE_HEIGHT, cardCqw, fitBylineLine, SHARER_SCALE } from "../lib/cardText";
import { displayAuthorName } from "../lib/authorName";
import { quoteBylineLines } from "../lib/quoteByline";

/**
 * A card's signature in the DOM — "— {name}", or on a quote "— {author}"
 * with a smaller "shared by {name}" line under it — laid out by the shared
 * card-text rule (lib/cardText.ts): one line each, at the card's fixed
 * signature size, shrunk to 80% and then cut with "…" if it still doesn't
 * fit `maxWidth`. Sizes are `cqw` of the card, like the message.
 *
 * Client-side for the viewer's interface language (the stored "anonymous"
 * placeholder and the quote wording); outside the provider it falls back to
 * the default locale rather than throwing — `Note` renders in server and
 * client trees alike.
 */
export function CardByline({
  authorName,
  isQuote,
  quoteAuthor,
  px,
  maxWidth,
  withGap = true,
  className,
}: {
  authorName: string;
  isQuote: boolean;
  quoteAuthor: string | null;
  /** The signature size, px at the card's baseline width. */
  px: number;
  /** How wide it may run, px at the baseline width. */
  maxWidth: number;
  /** Space above the signature (the fixed-box cards; a growing card's own `gap` already separates it). */
  withGap?: boolean;
  className?: string;
}) {
  const context = useOptionalLocale();
  const t = (context?.dictionary ?? getDictionary(defaultLocale)).quote;
  const lines = isQuote
    ? quoteBylineLines(quoteAuthor, authorName, t)
    : { authorLine: `— ${displayAuthorName(authorName, t.anonymousSharer)}`, sharedByLine: null };
  const main = lines.authorLine ? fitBylineLine(lines.authorLine, px, maxWidth) : null;
  const sharer = lines.sharedByLine ? fitBylineLine(lines.sharedByLine, px * SHARER_SCALE, maxWidth) : null;
  if (!main && !sharer) return null;
  return (
    <span
      className={cn("flex shrink-0 flex-col text-ink-soft", className)}
      style={{ paddingTop: withGap ? cardCqw(px * BYLINE_GAP) : undefined, lineHeight: BYLINE_LINE_HEIGHT }}
    >
      {main && (
        <span className="block overflow-hidden whitespace-nowrap" style={{ fontSize: cardCqw(main.px) }}>
          {main.text}
        </span>
      )}
      {sharer && (
        <span className="block overflow-hidden whitespace-nowrap opacity-80" style={{ fontSize: cardCqw(sharer.px) }}>
          {sharer.text}
        </span>
      )}
    </span>
  );
}
