"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Note } from "@/features/notes/components/Note";
import type { NoteData } from "@/features/notes/types";
import { useLocale } from "@/i18n/LocaleProvider";
import { TILE_PX } from "../lib/worldGeometry";
import type { PublicMessageDetail } from "../types";

interface DiscoveryFilters {
  keyword: string;
  from: string;
  to: string;
}

const EMPTY_FILTERS: DiscoveryFilters = { keyword: "", from: "", to: "" };

/** Reads `?query=&from=&to=` the same way useBoardCamera reads `?x=&y=&z=` — client-only, once, never through useSearchParams (see the module doc comment on why). */
function readInitialFiltersFromUrl(): DiscoveryFilters {
  if (typeof window === "undefined") return EMPTY_FILTERS;
  const params = new URLSearchParams(window.location.search);
  return { keyword: params.get("query") ?? "", from: params.get("from") ?? "", to: params.get("to") ?? "" };
}

function hasAnyFilter(filters: DiscoveryFilters): boolean {
  return Boolean(filters.keyword || filters.from || filters.to);
}

/** Writes query/from/to into the current URL without touching any other param (notably useBoardCamera's own x/y/z) and without a router navigation — see the module doc comment. */
function writeFiltersToUrl(filters: DiscoveryFilters): void {
  const params = new URLSearchParams(window.location.search);
  if (filters.keyword) params.set("query", filters.keyword);
  else params.delete("query");
  if (filters.from) params.set("from", filters.from);
  else params.delete("from");
  if (filters.to) params.set("to", filters.to);
  else params.delete("to");
  const queryString = params.toString();
  window.history.replaceState(null, "", queryString ? `${window.location.pathname}?${queryString}` : window.location.pathname);
}

function resultToNoteData(message: PublicMessageDetail): NoteData {
  return {
    id: message.id,
    content: message.content,
    authorName: message.author?.displayName ?? "",
    authorImage: message.author?.image ?? null,
    templateId: message.templateId,
    size: "sm",
    rotation: 0,
    position: { top: "0%", left: "0%" },
    language: message.language,
  };
}

/**
 * EPIC 021: /board's keyword/date discovery panel — a compact search bar
 * that sits above `InfiniteBoard`, with a results dropdown absolutely
 * positioned over the canvas so it never shrinks the board's own flex-1
 * viewport height (see the "gölgelememeli" requirement). Deliberately its
 * own state, synced to the URL with the exact same `history.replaceState`
 * technique `useBoardCamera` already established (never `router.push`,
 * which would force a Server Component re-render of `/board` on every
 * filter change and risk fighting the camera's own URL sync) — this is
 * reusing the board's existing state-sync pattern, not inventing a second
 * one, per this EPIC's explicit "no parallel board query system" rule.
 *
 * Fetches `/api/board/search` itself (client-side) whenever the user
 * actually submits or clears the form — driven directly from those event
 * handlers (and once from the mount effect below, for a URL that already
 * carries filters), never from a second effect reactively watching applied
 * filter state, which would need to call `setState` synchronously with no
 * async gap for the "filters are empty" branch. `onSelectResult` is how a
 * result's "view on board" action reaches `InfiniteBoard`'s new
 * `focusPoint` prop — see BoardPageContent.tsx.
 */
export function BoardDiscoveryPanel({ onSelectResult }: { onSelectResult: (point: { x: number; y: number }) => void }) {
  const { dictionary } = useLocale();
  const [form, setForm] = useState<DiscoveryFilters>(EMPTY_FILTERS);
  const [results, setResults] = useState<PublicMessageDetail[] | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const requestId = useRef(0);

  function runSearch(filters: DiscoveryFilters) {
    if (!hasAnyFilter(filters)) {
      setResults(null);
      setStatus("idle");
      return;
    }

    const thisRequest = ++requestId.current;
    setStatus("loading");

    const params = new URLSearchParams();
    if (filters.keyword) params.set("query", filters.keyword);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);

    fetch(`/api/board/search?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json() as Promise<{ results: PublicMessageDetail[] }>;
      })
      .then((data) => {
        if (requestId.current !== thisRequest) return;
        setResults(data.results);
        setStatus("ready");
      })
      .catch(() => {
        if (requestId.current !== thisRequest) return;
        setResults(null);
        setStatus("error");
      });
  }

  // Read the URL once on mount — same "client-only, once" shape as
  // useBoardCamera's initialCameraFromUrl — and immediately run whatever
  // search it already encodes, so a shared/refreshed URL restores results.
  useEffect(() => {
    const initial = readInitialFiltersFromUrl();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-only URL read, same justified exception as ReportDialog's own open-state sync
    setForm(initial);
    runSearch(initial);
  }, []);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    writeFiltersToUrl(form);
    runSearch(form);
  }

  function handleClear() {
    setForm(EMPTY_FILTERS);
    writeFiltersToUrl(EMPTY_FILTERS);
    setResults(null);
    setStatus("idle");
  }

  function handleSelect(message: PublicMessageDetail) {
    onSelectResult({
      x: message.tileX * TILE_PX + message.position.x * TILE_PX,
      y: message.tileY * TILE_PX + message.position.y * TILE_PX,
    });
    setResults(null);
    setStatus("idle");
  }

  // `status` is only ever "idle" via runSearch's own no-filter branch, so
  // "a search is currently applied" and "status isn't idle" are the same
  // condition — no separate "applied filters" state needed.
  const isActive = status !== "idle";
  const showPanel = status !== "idle";

  return (
    <div className="relative border-b border-border bg-surface/95 px-3 py-2 backdrop-blur sm:px-4">
      <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2">
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
        <label className="flex items-center gap-1.5 text-xs text-ink-soft">
          {dictionary.boardDiscovery.fromLabel}
          <input
            type="date"
            value={form.from}
            onChange={(event) => setForm((prev) => ({ ...prev, from: event.target.value }))}
            className="rounded-md border border-border bg-canvas px-2 py-1 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-ink-soft">
          {dictionary.boardDiscovery.toLabel}
          <input
            type="date"
            value={form.to}
            onChange={(event) => setForm((prev) => ({ ...prev, to: event.target.value }))}
            className="rounded-md border border-border bg-canvas px-2 py-1 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
          />
        </label>
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

      {showPanel && (
        <div className="absolute left-0 right-0 top-full z-[var(--z-overlay)] max-h-80 overflow-y-auto border-b border-border bg-surface p-3 shadow-card">
          {status === "loading" && <p className="text-sm text-ink-soft">{dictionary.boardDiscovery.loading}</p>}
          {status === "error" && <p className="text-sm text-red-600">{dictionary.boardDiscovery.error}</p>}
          {status === "ready" && results !== null && results.length === 0 && (
            <p className="text-sm text-ink-soft">{dictionary.boardDiscovery.noResults}</p>
          )}
          {status === "ready" && results !== null && results.length > 0 && (
            <ul className="flex flex-col gap-2">
              {results.map((message) => (
                <li key={message.id} className="flex items-center gap-3 rounded-md border border-border/70 bg-canvas/60 p-2">
                  <Note variant="static" note={resultToNoteData(message)} />
                  <div className="flex flex-1 flex-col gap-1">
                    <p className="text-xs text-ink-soft">{new Date(message.createdAt).toLocaleDateString()}</p>
                    <Button type="button" size="sm" variant="ghost" onClick={() => handleSelect(message)}>
                      {dictionary.archive.viewOnBoardAction}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
