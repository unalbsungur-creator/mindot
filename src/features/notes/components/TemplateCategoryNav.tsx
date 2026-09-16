"use client";

import { cn } from "@/lib/cn";

/** The four category buckets the "Bir not seç" picker groups templates into — "all" is every active template in registration order, the other three filter on `NoteTemplate.category` (undefined/"standard" counts as "standard"). */
export type TemplateCategoryFilter = "all" | "standard" | "seasonal" | "sports";

interface TemplateCategoryNavProps {
  active: TemplateCategoryFilter;
  onChange: (category: TemplateCategoryFilter) => void;
  labels: Record<TemplateCategoryFilter, string>;
}

/**
 * EPIC 039: the pill/chip row that switches which category's horizontal
 * rail (`HorizontalTemplateRail`) is shown below it — plain buttons (not a
 * full ARIA tabs pattern), matching this EPIC's own accessibility brief
 * ("Kategori: button"). Clicking a chip only swaps which rail is visible;
 * it never navigates or scrolls the page.
 *
 * A plain flex-wrap row on desktop; `overflow-x-auto` lets it become its
 * own tiny horizontal scroller on a narrow viewport if four chips ever
 * don't fit one line, without needing a second component for that case.
 */
export function TemplateCategoryNav({ active, onChange, labels }: TemplateCategoryNavProps) {
  const categories: TemplateCategoryFilter[] = ["all", "standard", "seasonal", "sports"];

  return (
    <div className="flex min-w-0 flex-wrap gap-2 overflow-x-auto pb-1" role="group">
      {categories.map((category) => {
        const selected = category === active;
        return (
          <button
            key={category}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(category)}
            className={cn(
              "shrink-0 rounded-pill border px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange",
              selected
                ? "border-navy bg-navy text-white"
                : "border-border bg-surface text-ink-soft hover:border-navy/40 hover:text-navy"
            )}
          >
            {labels[category]}
          </button>
        );
      })}
    </div>
  );
}
