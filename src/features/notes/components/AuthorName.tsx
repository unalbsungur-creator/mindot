"use client";

import { defaultLocale } from "@/i18n/config";
import { useOptionalLocale } from "@/i18n/LocaleProvider";
import { getDictionary } from "@/i18n/translations";
import { displayAuthorName } from "../lib/authorName";

/**
 * The name in a card's "— {name}" line, with the stored "anonymous"
 * placeholder translated to the interface language (see
 * `displayAuthorName`). Client-side for the same reason as `QuoteByline`:
 * `Note` renders in server and client trees alike; outside the provider it
 * falls back to the default locale rather than throwing.
 */
export function AuthorName({ name }: { name: string }) {
  const context = useOptionalLocale();
  const label = (context?.dictionary ?? getDictionary(defaultLocale)).quote.anonymousSharer;
  return <>{displayAuthorName(name, label)}</>;
}
