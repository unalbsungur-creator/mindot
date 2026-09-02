"use client";

import { locales, localeShortLabels } from "@/i18n/config";
import { useLocale } from "@/i18n/LocaleProvider";
import { cn } from "@/lib/cn";

/**
 * A native <select> rather than a custom dropdown: full keyboard support
 * and screen-reader behavior for free, and it stays usable at any width —
 * important once "Français" or "Deutsch" sit next to three other options
 * on a small screen.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale, dictionary } = useLocale();

  return (
    <label className={cn("relative inline-flex items-center", className)}>
      <span className="sr-only">{dictionary.common.language}</span>
      <select
        value={locale}
        onChange={(event) => setLocale(event.target.value as (typeof locales)[number])}
        className="appearance-none rounded-pill border border-white/25 bg-transparent py-1.5 pl-3 pr-6 text-xs font-medium uppercase tracking-wide text-white/75 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange [color-scheme:dark]"
        aria-label={dictionary.common.language}
      >
        {locales.map((code) => (
          <option key={code} value={code}>
            {localeShortLabels[code]}
          </option>
        ))}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 10 6"
        className="pointer-events-none absolute right-2 h-1.5 w-2.5 fill-none stroke-white/75"
        strokeWidth={1.5}
      >
        <path d="M1 1l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </label>
  );
}
