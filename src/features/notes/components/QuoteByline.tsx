"use client";

import type { CSSProperties } from "react";
import { defaultLocale } from "@/i18n/config";
import { useOptionalLocale } from "@/i18n/LocaleProvider";
import { getDictionary } from "@/i18n/translations";
import { quoteBylineLines } from "../lib/quoteByline";

/**
 * MB-01: a quote's byline on a card — "— {quote author}" as the main line,
 * and a smaller "shared by {name}" line under it. Replaces the single
 * "— {name}" line only on quotes; own words never reach this component.
 * Client-side only for the viewer's interface language (`Note` itself is
 * rendered from server and client trees alike); outside the provider it
 * falls back to the default locale rather than throwing.
 *
 * `className` is the byline's own class from the card branch (its size and
 * alignment), so the author line keeps exactly the size "— {name}" had;
 * the sharer line is 0.8em of it.
 */
export function QuoteByline({
  quoteAuthor,
  sharerName,
  className,
  style,
}: {
  quoteAuthor: string | null;
  sharerName: string;
  className?: string;
  style?: CSSProperties;
}) {
  const context = useOptionalLocale();
  const t = (context?.dictionary ?? getDictionary(defaultLocale)).quote;
  const { authorLine, sharedByLine } = quoteBylineLines(quoteAuthor, sharerName, t);
  return (
    <span className={className} style={{ ...style, display: "flex", flexDirection: "column" }}>
      {authorLine && <span>{authorLine}</span>}
      {sharedByLine && <span className="text-[0.8em] opacity-80">{sharedByLine}</span>}
    </span>
  );
}
