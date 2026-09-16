"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { TemplateCategoryNav, type TemplateCategoryFilter } from "@/features/notes/components/TemplateCategoryNav";
import { useLocale } from "@/i18n/LocaleProvider";
import { computeDateRange, EMPTY_DATE_FILTER, type DateFilterMode, type DateFilterState } from "../lib/dateFilterPresets";
import { BoardDateFilter } from "./BoardDateFilter";
import type { PublicMessageDetail } from "../types";

interface DiscoveryFilters {
  keyword: string;
  date: DateFilterState;
  category: TemplateCategoryFilter;
}

/**
 * EPIC — Duvar İçi Filtreleme: what `InfiniteBoard` needs to turn already-
 * rendered world-space cards into a filtered view — never a second list of
 * its own. `matchedIds === null` means "no active filter, show every
 * card" (the same meaning `status === "idle"` already had); a non-null Set
 * (possibly empty) means "show only these ids." `status` is exposed
 * separately so the board can show its own small loading/error hint in
 * the same place a "no matches" hint goes, without needing a second piece
 * of state to represent "is a request in flight."
 */
export interface BoardFilterResult {
  status: "idle" | "loading" | "ready" | "error";
  matchedIds: Set<string> | null;
}

const EMPTY_FILTERS: DiscoveryFilters = { keyword: "", date: EMPTY_DATE_FILTER, category: "all" };
const VALID_DATE_MODES: DateFilterMode[] = ["none", "today", "week", "month", "year", "day"];
const VALID_CATEGORIES: TemplateCategoryFilter[] = ["all", "standard", "seasonal", "sports"];

/**
 * EPIC — Paylaşılan Kartlarda Gelişmiş Filtreleme: reads `?query=&dateMode=&day=&category=`
 * the same "client-only, once" way `readInitialFiltersFromUrl` always has
 * (see the module doc comment below) — `dateMode`/`category` replace the
 * old raw `from`/`to` params; an unrecognized value for either falls back
 * to "no restriction" rather than ever being sent on to the API.
 */
function readInitialFiltersFromUrl(): DiscoveryFilters {
  if (typeof window === "undefined") return EMPTY_FILTERS;
  const params = new URLSearchParams(window.location.search);
  const rawMode = params.get("dateMode");
  const mode: DateFilterMode = VALID_DATE_MODES.includes(rawMode as DateFilterMode) ? (rawMode as DateFilterMode) : "none";
  const rawCategory = params.get("category");
  const category: TemplateCategoryFilter = VALID_CATEGORIES.includes(rawCategory as TemplateCategoryFilter)
    ? (rawCategory as TemplateCategoryFilter)
    : "all";
  return {
    keyword: params.get("query") ?? "",
    date: { mode, day: params.get("day") ?? "" },
    category,
  };
}

/** A "Belirli Gün" selection with no day chosen yet is a half-finished filter, not a real one — never worth a request (see `computeDateRange`'s own doc comment for why it resolves that case to `{}`). */
function isDateFilterSet(date: DateFilterState): boolean {
  if (date.mode === "none") return false;
  if (date.mode === "day") return date.day !== "";
  return true;
}

function hasAnyFilter(filters: DiscoveryFilters): boolean {
  return Boolean(filters.keyword || isDateFilterSet(filters.date) || filters.category !== "all");
}

/** Writes query/dateMode/day/category into the current URL without touching any other param (notably useBoardCamera's own x/y/z) and without a router navigation — see the module doc comment. */
function writeFiltersToUrl(filters: DiscoveryFilters): void {
  const params = new URLSearchParams(window.location.search);
  if (filters.keyword) params.set("query", filters.keyword);
  else params.delete("query");
  if (filters.date.mode !== "none") params.set("dateMode", filters.date.mode);
  else params.delete("dateMode");
  if (filters.date.mode === "day" && filters.date.day) params.set("day", filters.date.day);
  else params.delete("day");
  if (filters.category !== "all") params.set("category", filters.category);
  else params.delete("category");
  const queryString = params.toString();
  window.history.replaceState(null, "", queryString ? `${window.location.pathname}?${queryString}` : window.location.pathname);
}

/**
 * EPIC 021: /board's keyword/date/category discovery panel — a compact
 * search bar above `InfiniteBoard`, with a hover/tap dropdown for the
 * date-preset and category filter groups (EPIC: Kompakt Filtreleme
 * Paneli). Deliberately its own state, synced to the URL with the exact
 * same `history.replaceState` technique `useBoardCamera` already
 * established (never `router.push`, which would force a Server Component
 * re-render of `/board` on every filter change and risk fighting the
 * camera's own URL sync) — reusing the board's existing state-sync
 * pattern, not inventing a second one.
 *
 * EPIC — Duvar İçi Filtreleme: this component's `/api/board/search` call
 * (keyword + date preset, via `dateFilterPresets.ts`'s timezone-safe
 * math + category, via EPIC 039's `NoteTemplateCategory`) is completely
 * unchanged — the only thing that changed is what happens to the result.
 * It used to render its own dropdown list of matches with a "Panoda gör"
 * jump-camera action per row; now it reports the matched id set to
 * `onFilterChange`, and the parent (`BoardPageContent`) hands that
 * straight to `InfiniteBoard`, which hides any already-rendered
 * world-space card whose id isn't in the set — the board itself becomes
 * the result view, never a second list/page. No results-fetching logic
 * changed, only the presentation of the result.
 */
export function BoardDiscoveryPanel({ onFilterChange }: { onFilterChange: (result: BoardFilterResult) => void }) {
  const { dictionary } = useLocale();
  const [form, setForm] = useState<DiscoveryFilters>(EMPTY_FILTERS);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  // Only ever updated on an "idle" (no filter) or "ready" (fresh results)
  // transition — deliberately left untouched while `status === "loading"`
  // or `"error"`, so a request in flight (or a failed one) never flashes
  // the board to "show everything"/"show nothing" mid-search; it keeps
  // showing whatever the last successful outcome was.
  const [matchedIds, setMatchedIds] = useState<Set<string> | null>(null);
  const requestId = useRef(0);
  // EPIC 046: the date-preset/category rows used to render permanently —
  // now they're a dropdown anchored to a small trigger button, closed by
  // default. `onMouseEnter`/`onMouseLeave` on the wrapper around trigger+
  // panel give desktop mouse users hover-to-open/leave-to-close for free;
  // touch devices never fire those events at all, so the trigger's own
  // `onClick` toggle (which works identically for a mouse click) is what
  // actually drives mobile open/close — no pointer-type branching needed,
  // the two mechanisms simply never conflict.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterWrapperRef = useRef<HTMLDivElement>(null);

  function runSearch(filters: DiscoveryFilters) {
    if (!hasAnyFilter(filters)) {
      setStatus("idle");
      setMatchedIds(null);
      return;
    }

    const thisRequest = ++requestId.current;
    setStatus("loading");

    const { from, to } = computeDateRange(filters.date);
    const params = new URLSearchParams();
    if (filters.keyword) params.set("query", filters.keyword);
    if (from) params.set("from", from.toISOString());
    if (to) params.set("to", to.toISOString());
    if (filters.category !== "all") params.set("category", filters.category);

    fetch(`/api/board/search?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json() as Promise<{ results: PublicMessageDetail[] }>;
      })
      .then((data) => {
        if (requestId.current !== thisRequest) return;
        setStatus("ready");
        setMatchedIds(new Set(data.results.map((message) => message.id)));
      })
      .catch(() => {
        if (requestId.current !== thisRequest) return;
        setStatus("error");
      });
  }

  // Read the URL once on mount — same "client-only, once" shape as
  // useBoardCamera's initialCameraFromUrl — and immediately run whatever
  // search it already encodes, so a shared/refreshed URL restores the
  // same filtered board view.
  useEffect(() => {
    const initial = readInitialFiltersFromUrl();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-only URL read, same justified exception as ReportDialog's own open-state sync
    setForm(initial);
    runSearch(initial);
  }, []);

  // Reports the current outcome up to InfiniteBoard (via BoardPageContent)
  // whenever it actually changes — fires after status/matchedIds commit,
  // never computed from a possibly-stale closure at the setState call site.
  useEffect(() => {
    onFilterChange({ status, matchedIds });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onFilterChange is a plain setState passed from the parent; including it would re-run this on every parent render for no reason
  }, [status, matchedIds]);

  // EPIC — Duvar İçi Filtreleme (mobile): "dışarı dokununca panel
  // kapanmalı" — hover's `onMouseLeave` already covers desktop, but touch
  // has no leave event, so a tap anywhere outside the trigger+panel closes
  // it explicitly. Only listens while actually open.
  useEffect(() => {
    if (!filtersOpen) return;
    function handlePointerDown(event: PointerEvent) {
      if (filterWrapperRef.current?.contains(event.target as Node)) return;
      setFiltersOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [filtersOpen]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    writeFiltersToUrl(form);
    runSearch(form);
  }

  function handleClear() {
    setForm(EMPTY_FILTERS);
    writeFiltersToUrl(EMPTY_FILTERS);
    setStatus("idle");
    setMatchedIds(null);
  }

  // EPIC — Paylaşılan Kartlarda Gelişmiş Filtreleme: both filter rows
  // apply and search immediately on change (no separate "Uygula" step for
  // them) — matching this EPIC's "gerçek zamanlı güncellenmeli" requirement.
  // The keyword field alone keeps the existing submit-to-search behavior
  // (typing shouldn't search on every keystroke) — unchanged from before.
  function applyFilters(next: DiscoveryFilters) {
    setForm(next);
    writeFiltersToUrl(next);
    runSearch(next);
  }

  // `status` is only ever "idle" via runSearch's own no-filter branch, so
  // "a filter is currently applied" and "status isn't idle" are the same
  // condition — no separate "applied filters" state needed.
  const isActive = status !== "idle";

  const dateLabels: Record<Exclude<DateFilterMode, "none">, string> = {
    today: dictionary.boardDiscovery.dateToday,
    week: dictionary.boardDiscovery.dateThisWeek,
    month: dictionary.boardDiscovery.dateThisMonth,
    year: dictionary.boardDiscovery.dateThisYear,
    day: dictionary.boardDiscovery.dateSpecificDay,
  };
  const categoryLabels: Record<TemplateCategoryFilter, string> = {
    all: dictionary.write.templateCategoryAllLabel,
    standard: dictionary.write.templateStandardLabel,
    seasonal: dictionary.write.templateOccasionLabel,
    sports: dictionary.write.templateCategorySportsLabel,
  };

  return (
    <div className="relative z-[var(--z-panel)] border-b border-border bg-surface/95 px-3 py-2 backdrop-blur sm:px-4">
      <div className="flex flex-wrap items-center gap-2">
        <form onSubmit={handleSubmit} className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="board-discovery-keyword">
            {dictionary.boardDiscovery.searchLabel}
          </label>
          <input
            id="board-discovery-keyword"
            type="search"
            value={form.keyword}
            onChange={(event) => setForm((prev) => ({ ...prev, keyword: event.target.value }))}
            placeholder={dictionary.boardDiscovery.searchPlaceholder}
            className="min-w-0 flex-1 rounded-md border border-border bg-canvas px-3 py-1.5 text-sm text-ink shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
          />
          <Button type="submit" size="sm">
            {dictionary.boardDiscovery.applyAction}
          </Button>
          {isActive && (
            <Button type="button" variant="ghost" size="sm" onClick={handleClear}>
              {dictionary.boardDiscovery.clearAction}
            </Button>
          )}
          {isActive && <span className="text-xs font-medium text-orange-ink">{dictionary.boardDiscovery.activeHint}</span>}
        </form>

        {/*
         * The date-preset/category rows render only inside this dropdown,
         * anchored to the trigger below — closed by default so the board
         * keeps its full vertical space (EPIC's "gereksiz büyük filtre
         * alanı görünmemeli"). `onMouseEnter`/`onMouseLeave` here give
         * desktop mouse users hover-to-open, leave-to-close for free —
         * touch devices simply never fire those events, so they fall
         * through to the trigger button's own `onClick` toggle plus the
         * document-level pointerdown-outside listener above, which is the
         * real mobile mechanism (tap to open, tap the trigger or anywhere
         * outside to close). The dropdown is `position: absolute`, so it
         * overlays the board rather than pushing it down in either state,
         * and never touches the board's own world transform.
         */}
        <div
          ref={filterWrapperRef}
          className="relative shrink-0"
          onMouseEnter={() => setFiltersOpen(true)}
          onMouseLeave={() => setFiltersOpen(false)}
        >
          <button
            type="button"
            onClick={() => setFiltersOpen((open) => !open)}
            aria-expanded={filtersOpen}
            aria-controls="board-filters-panel"
            className={cn(
              "flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange",
              filtersOpen || isActive
                ? "border-navy bg-navy text-white"
                : "border-border bg-surface text-ink-soft hover:border-navy/40 hover:text-navy"
            )}
          >
            <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 3.5h12M4.5 8h7M7 12.5h2" />
            </svg>
            {dictionary.boardDiscovery.filtersToggleLabel}
            {isActive && !filtersOpen && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-orange" />}
          </button>

          {filtersOpen && (
            <div
              id="board-filters-panel"
              role="region"
              aria-label={dictionary.boardDiscovery.filtersPanelLabel}
              className="absolute right-0 top-full z-[var(--z-panel)] mt-2 flex w-72 max-w-[calc(100vw-1.5rem)] flex-col gap-3 rounded-md border border-border bg-surface p-3 shadow-card"
            >
              <BoardDateFilter
                mode={form.date.mode}
                day={form.date.day}
                onModeChange={(mode) => applyFilters({ ...form, date: { mode, day: mode === "day" ? form.date.day : "" } })}
                onDayChange={(day) => applyFilters({ ...form, date: { mode: "day", day } })}
                groupLabel={dictionary.boardDiscovery.dateFilterLabel}
                specificDayInputLabel={dictionary.boardDiscovery.dateSpecificDayInputLabel}
                labels={dateLabels}
              />

              <TemplateCategoryNav
                active={form.category}
                onChange={(category) => applyFilters({ ...form, category })}
                labels={categoryLabels}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
