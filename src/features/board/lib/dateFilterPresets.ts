/**
 * EPIC — Paylaşılan Kartlarda Gelişmiş Filtreleme: pure date-range math for
 * the board discovery panel's new date presets, replacing the old raw
 * "Başlangıç"/"Bitiş" `<input type="date">` pair. No React, no DOM — same
 * "pure math, testable and reusable" shape as `worldGeometry.ts` in this
 * same feature.
 *
 * Every boundary below is built with the multi-argument `Date` constructor
 * (`new Date(year, month, day, ...)`), which JavaScript always interprets
 * in the *local* timezone — deliberately never `new Date("YYYY-MM-DD")`,
 * which the ECMAScript spec instead parses as UTC midnight. That second
 * form is exactly the well-known source of the "day shifts by one"
 * timezone bug this EPIC's brief explicitly warns about: for any
 * timezone east of UTC, "today" parsed as UTC midnight is still
 * "yesterday" locally until the offset catches up. Computing boundaries
 * in local time here, then letting the caller serialize them with
 * `.toISOString()` (which correctly converts the *already-local-correct*
 * instant to its UTC equivalent) before sending them to `/api/board/search`,
 * preserves the user's own real calendar day/week/month/year regardless of
 * server timezone.
 */

export type DateFilterMode = "none" | "today" | "week" | "month" | "year" | "day";

export interface DateFilterState {
  mode: DateFilterMode;
  /** `YYYY-MM-DD` — only meaningful (and only ever set) when `mode === "day"`. */
  day: string;
}

export const EMPTY_DATE_FILTER: DateFilterState = { mode: "none", day: "" };

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function endOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

/** Monday-start week (ISO/TR convention) — `getDay()` is 0=Sunday..6=Saturday. */
function startOfWeek(date: Date): Date {
  const weekday = date.getDay();
  const diffToMonday = weekday === 0 ? -6 : 1 - weekday;
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() + diffToMonday);
  return startOfLocalDay(monday);
}

function endOfWeek(date: Date): Date {
  const monday = startOfWeek(date);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  return endOfLocalDay(sunday);
}

/**
 * Parses a plain `YYYY-MM-DD` string (the exact format `<input
 * type="date">` produces) into local year/month/day components — never
 * `new Date(value)` directly, for the same UTC-midnight reason explained
 * above.
 */
function parseDateInputValue(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]) };
}

/**
 * `YYYY-MM-DD` (the `<input type="date">` value) → `DD.MM.YYYY`, for
 * showing the chosen day directly on the "Belirli Gün" trigger pill once
 * one is picked (e.g. "12.09.2026") — pure string reformatting, no `Date`
 * object involved at all, so there's no timezone conversion to get wrong
 * in the first place. `null` for an empty/unparseable value, so a caller
 * can fall back to the plain "Belirli Gün" label.
 */
export function formatDateInputValueForDisplay(value: string): string | null {
  const parsed = parseDateInputValue(value);
  if (!parsed) return null;
  const day = String(parsed.day).padStart(2, "0");
  const month = String(parsed.month + 1).padStart(2, "0");
  return `${day}.${month}.${parsed.year}`;
}

/**
 * Resolves a `DateFilterState` to the `{from, to}` instant range
 * `/api/board/search` expects — `{}` (no restriction) for `"none"`, or for
 * `"day"` with no (or an unparseable) date chosen yet, so a half-finished
 * "Belirli Gün" selection never accidentally searches with a stale/empty
 * range.
 */
export function computeDateRange(state: DateFilterState, now: Date = new Date()): { from?: Date; to?: Date } {
  switch (state.mode) {
    case "none":
      return {};
    case "today":
      return { from: startOfLocalDay(now), to: endOfLocalDay(now) };
    case "week":
      return { from: startOfWeek(now), to: endOfWeek(now) };
    case "month":
      return {
        from: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0),
        // Day 0 of *next* month is the last day of *this* month — the standard JS idiom, no separate "days in month" table needed.
        to: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
      };
    case "year":
      return {
        from: new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0),
        to: new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999),
      };
    case "day": {
      const parsed = parseDateInputValue(state.day);
      if (!parsed) return {};
      return {
        from: new Date(parsed.year, parsed.month, parsed.day, 0, 0, 0, 0),
        to: new Date(parsed.year, parsed.month, parsed.day, 23, 59, 59, 999),
      };
    }
  }
}
