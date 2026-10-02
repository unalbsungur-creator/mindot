import type { Locale } from "@/i18n/config";

/**
 * PDF Download V2's printed date: the day the PDF is generated — not the
 * note's own date — as day, full month name, year ("<D> EKİM <YYYY>",
 * uppercased with the locale's own casing rules so Turkish gets "EKİM",
 * not "EKIM"). Computed from the `now` the caller passes at render time;
 * nothing about the date lives in the background asset or the templates,
 * so a later re-download prints that later day.
 *
 * `timeZone` is the downloader's zone when known (see `pdf.tsx`); an
 * unknown or invalid zone falls back to the runtime's default rather than
 * failing the download.
 */
export function formatPdfDownloadDate(now: Date, locale: Locale, timeZone?: string): string {
  const options: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" };
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat(locale, timeZone ? { ...options, timeZone } : options);
  } catch {
    formatter = new Intl.DateTimeFormat(locale, options);
  }
  return formatter.format(now).toLocaleUpperCase(locale);
}
