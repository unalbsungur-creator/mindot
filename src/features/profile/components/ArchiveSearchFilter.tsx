"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale } from "@/i18n/LocaleProvider";

/**
 * A quiet content search over the signed-in owner's own archive — same
 * "just rewrite the URL, let the Server Component page re-query" shape as
 * `TimeRangeFilter` right above it on this page, so the two filters
 * compose freely (searching, then narrowing by date, or the reverse,
 * both just add/replace one query param on whatever the other already
 * set). The actual privacy/scoping boundary is server-side —
 * `getPrivateArchive(session.user.id, ...)` — this component only ever
 * produces a `?q=` value, never anything that could widen what gets
 * searched.
 */
export function ArchiveSearchFilter() {
  const { dictionary } = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const q = searchParams.get("q") ?? "";

  function apply(nextQ: string) {
    // Preserves the date filter (from/to) already on the URL, if any —
    // only `q` and `page` change here. Dropping `page` on every search
    // change is deliberate: a new (or newly cleared) search always starts
    // its own results from page 1, the same way TimeRangeFilter's own
    // `apply()` already resets pagination on a date change.
    const params = new URLSearchParams(searchParams);
    params.delete("page");
    const trimmed = nextQ.trim();
    if (trimmed) params.set("q", trimmed);
    else params.delete("q");
    router.push(params.size > 0 ? `${pathname}?${params.toString()}` : pathname);
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      <form
        className="flex flex-wrap items-center justify-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          const value = formData.get("q");
          apply(typeof value === "string" ? value : "");
        }}
      >
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder={dictionary.archive.searchPlaceholder}
          className="w-56 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-ink shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
        />
        <button type="submit" className="rounded-pill border border-border px-3 py-1.5 text-xs font-medium text-ink-soft hover:text-navy">
          {dictionary.archive.searchButton}
        </button>
        {q && (
          <button type="button" onClick={() => apply("")} className="text-xs font-medium text-ink-soft hover:text-navy">
            {dictionary.archive.clearSearchAction}
          </button>
        )}
      </form>
      {q && (
        <p className="text-xs text-ink-soft">{dictionary.archive.searchActiveLabel.replace("{query}", q)}</p>
      )}
    </div>
  );
}
