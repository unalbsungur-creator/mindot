import type { TimeRange } from "../types";

/** Parses `?from=YYYY-MM-DD&to=YYYY-MM-DD` into the repository's `{from?, to?}` range shape — the only place URL query params get turned into Dates, so the archive/wall pages stay thin. `to` is treated as inclusive (end of that day). */
export function parseTimeRangeParams(searchParams: Record<string, string | string[] | undefined>): TimeRange {
  const fromRaw = searchParams.from;
  const toRaw = searchParams.to;
  return {
    from: typeof fromRaw === "string" ? parseDateParam(fromRaw, false) : undefined,
    to: typeof toRaw === "string" ? parseDateParam(toRaw, true) : undefined,
  };
}

function parseDateParam(value: string, endOfDay: boolean): Date | undefined {
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}
