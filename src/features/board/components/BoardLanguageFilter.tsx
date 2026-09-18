"use client";

import { cn } from "@/lib/cn";
import { locales, localeLabels, type Locale } from "@/i18n/config";

export type LanguageFilterValue = "all" | Locale;

interface BoardLanguageFilterProps {
  active: LanguageFilterValue;
  onChange: (value: LanguageFilterValue) => void;
  groupLabel: string;
  allLabel: string;
}

/**
 * EPIC — Duvar Filtreleme: Dil Tercihi — filters on `message.language`,
 * the writer's own explicit content-language choice at submission time
 * (see `WriteThoughtForm`'s language `<select>`) — never the visitor's
 * *interface* language (`useLocale()`), a deliberately different concept
 * (see CLAUDE.md's "Internationalization"). Same pill/`aria-pressed`
 * pattern as `BoardDateFilter`/`TemplateCategoryNav` for visual and
 * accessibility consistency with the board's other filter rows. Option
 * labels reuse `localeLabels` (native names — "English", "Türkçe",
 * "Deutsch", "Français", "Español") directly from `@/i18n/config`, the
 * exact same labels the write flow's own language picker and the header's
 * `LanguageSwitcher` already show, rather than inventing a second way to
 * name a language.
 */
export function BoardLanguageFilter({ active, onChange, groupLabel, allLabel }: BoardLanguageFilterProps) {
  const options: LanguageFilterValue[] = ["all", ...locales];

  return (
    <div className="flex flex-wrap gap-2 overflow-x-auto pb-1" role="group" aria-label={groupLabel}>
      {options.map((option) => {
        const selected = option === active;
        const label = option === "all" ? allLabel : localeLabels[option];
        return (
          <button
            key={option}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option)}
            className={cn(
              "shrink-0 rounded-pill border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange",
              selected
                ? "border-navy bg-navy text-white"
                : "border-border bg-surface text-ink-soft hover:border-navy/40 hover:text-navy"
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
