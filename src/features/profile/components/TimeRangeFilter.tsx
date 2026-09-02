"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale } from "@/i18n/LocaleProvider";
import { cn } from "@/lib/cn";

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function thisYearRange(): [string, string] {
  const year = new Date().getFullYear();
  return [`${year}-01-01`, isoDate(new Date())];
}

function lastYearRange(): [string, string] {
  const year = new Date().getFullYear() - 1;
  return [`${year}-01-01`, `${year}-12-31`];
}

/**
 * A quiet time-exploration control, not an analytics dashboard: three
 * presets, a month picker, and a custom range — every change just
 * rewrites `?from=&to=` on the current URL, which the Server Component
 * page reads and passes straight to the repository's own `range`
 * parameter (EPIC 004's time-filtering foundation). No client-side
 * filtering of an already-fetched dataset.
 */
export function TimeRangeFilter() {
  const { dictionary } = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";

  function apply(nextFrom?: string, nextTo?: string) {
    const params = new URLSearchParams();
    if (nextFrom) params.set("from", nextFrom);
    if (nextTo) params.set("to", nextTo);
    router.push(params.size > 0 ? `${pathname}?${params.toString()}` : pathname);
  }

  const [thisYearFrom, thisYearTo] = thisYearRange();
  const [lastYearFrom, lastYearTo] = lastYearRange();
  const isAllTime = !from && !to;
  const isThisYear = from === thisYearFrom && to === thisYearTo;
  const isLastYear = from === lastYearFrom && to === lastYearTo;

  const presetClasses = (active: boolean) =>
    cn(
      "rounded-pill border px-3 py-1.5 text-xs font-medium transition-colors",
      active ? "border-orange bg-orange text-navy" : "border-border text-ink-soft hover:text-navy"
    );

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" onClick={() => apply()} className={presetClasses(isAllTime)}>
          {dictionary.archive.allTime}
        </button>
        <button type="button" onClick={() => apply(thisYearFrom, thisYearTo)} className={presetClasses(isThisYear)}>
          {dictionary.archive.thisYear}
        </button>
        <button type="button" onClick={() => apply(lastYearFrom, lastYearTo)} className={presetClasses(isLastYear)}>
          {dictionary.archive.lastYear}
        </button>
      </div>
      <form
        className="flex flex-wrap items-center justify-center gap-2 text-xs text-ink-soft"
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          const monthValue = formData.get("month");
          if (typeof monthValue === "string" && monthValue) {
            const [year, month] = monthValue.split("-").map(Number);
            const start = new Date(Date.UTC(year, month - 1, 1));
            const end = new Date(Date.UTC(year, month, 0));
            apply(isoDate(start), isoDate(end));
            return;
          }
          const customFrom = formData.get("from");
          const customTo = formData.get("to");
          apply(
            typeof customFrom === "string" && customFrom ? customFrom : undefined,
            typeof customTo === "string" && customTo ? customTo : undefined
          );
        }}
      >
        <label className="flex items-center gap-1.5">
          {dictionary.archive.monthLabel}
          <input type="month" name="month" className="rounded-md border border-border bg-surface px-2 py-1" />
        </label>
        <span className="text-ink-soft/60">{dictionary.archive.orLabel}</span>
        <label className="flex items-center gap-1.5">
          {dictionary.archive.fromLabel}
          <input type="date" name="from" defaultValue={from} className="rounded-md border border-border bg-surface px-2 py-1" />
        </label>
        <label className="flex items-center gap-1.5">
          {dictionary.archive.toLabel}
          <input type="date" name="to" defaultValue={to} className="rounded-md border border-border bg-surface px-2 py-1" />
        </label>
        <button type="submit" className="rounded-pill border border-border px-3 py-1.5 font-medium text-ink-soft hover:text-navy">
          {dictionary.archive.applyRange}
        </button>
      </form>
    </div>
  );
}
