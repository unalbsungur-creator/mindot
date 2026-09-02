/**
 * Single source of truth for supported interface languages. Add a locale by
 * adding it here and creating its dictionary in `translations/` — nothing
 * else needs to change (the compiler will point at any consumer that still
 * needs updating, since `Dictionary` is strongly typed per locale).
 */
export const locales = ["en", "tr", "de", "fr", "es"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

export const localeLabels: Record<Locale, string> = {
  en: "English",
  tr: "Türkçe",
  de: "Deutsch",
  fr: "Français",
  es: "Español",
};

export const localeShortLabels: Record<Locale, string> = {
  en: "EN",
  tr: "TR",
  de: "DE",
  fr: "FR",
  es: "ES",
};

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

/**
 * Best-effort match of a browser language tag (e.g. "de-AT") to one of our
 * supported locales. Used only as an initial suggestion — the user can
 * always override it, and the choice persists once they do.
 */
export function matchBrowserLocale(tag: string | undefined): Locale {
  if (!tag) return defaultLocale;
  const base = tag.slice(0, 2).toLowerCase();
  return isLocale(base) ? base : defaultLocale;
}
