"use client";

import Image from "next/image";
import { useLocale } from "@/i18n/LocaleProvider";
import { cn } from "@/lib/cn";
import { pdfBackgrounds } from "../config/pdfBackgrounds";

/**
 * Picks the personal PDF's background design (config/pdfBackgrounds.ts).
 * Purely a choice of artwork: free, stored nowhere, and only passed to the
 * download route as `?background=` — it never touches the Token unlock.
 * Thumbnails are the pre-sized WebP previews, so they're served as-is.
 */
export function PdfBackgroundPicker({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  const { dictionary } = useLocale();
  const t = dictionary.memory;
  return (
    <fieldset className={cn("flex w-full max-w-sm flex-col gap-2", className)}>
      <legend className="text-sm font-medium text-navy">{t.pdfBackgroundHeading}</legend>
      <div role="radiogroup" aria-label={t.pdfBackgroundHeading} className="grid grid-cols-3 gap-2">
        {pdfBackgrounds.map((background) => {
          const selected = background.id === value;
          return (
            <button
              key={background.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(background.id)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-md border p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange",
                selected ? "border-navy bg-navy/5 ring-2 ring-navy" : "border-border bg-surface hover:border-navy/40"
              )}
            >
              <span className="relative block w-full overflow-hidden rounded-sm" style={{ aspectRatio: "2 / 3" }}>
                <Image src={background.thumbnail} alt="" width={240} height={360} unoptimized className="h-full w-full object-cover" />
                {selected && (
                  <span
                    aria-hidden="true"
                    className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-navy text-[11px] font-bold leading-none text-surface shadow-card"
                  >
                    ✓
                  </span>
                )}
              </span>
              <span className={cn("text-center text-xs leading-tight", selected ? "font-semibold text-navy" : "text-ink-soft")}>
                {background.name}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-ink-soft">{t.pdfBackgroundHint}</p>
    </fieldset>
  );
}
