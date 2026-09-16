"use client";

import { cn } from "@/lib/cn";
import { formatDateInputValueForDisplay, type DateFilterMode } from "../lib/dateFilterPresets";

interface BoardDateFilterProps {
  mode: DateFilterMode;
  day: string;
  onModeChange: (mode: DateFilterMode) => void;
  onDayChange: (day: string) => void;
  groupLabel: string;
  specificDayInputLabel: string;
  labels: Record<Exclude<DateFilterMode, "none">, string>;
}

const PRESET_MODES: Exclude<DateFilterMode, "none">[] = ["today", "week", "month", "year", "day"];

/**
 * EPIC — Paylaşılan Kartlarda Gelişmiş Filtreleme: replaces the old raw
 * "Başlangıç"/"Bitiş" `<input type="date">` pair with five real-calendar
 * presets (Bugün/Bu Hafta/Bu Ay/Bu Yıl/Belirli Gün) — the actual `{from,
 * to}` instant range for each is computed by `lib/dateFilterPresets.ts`'s
 * `computeDateRange`, this component only owns *which* preset is chosen.
 * Same pill/`aria-pressed` pattern as `features/notes/components/
 * TemplateCategoryNav.tsx` (this EPIC's category filter below reuses that
 * component directly) for visual and accessibility consistency between
 * the two filter rows, without either one depending on the other.
 *
 * Unlike the category filter, there's no explicit "clear" pill here — the
 * existing "Temizle" button (`BoardDiscoveryPanel`'s `handleClear`,
 * unchanged) already clears every filter including this one; adding a
 * second, date-only clear control would be a second way to do the same
 * thing for no real benefit in this compact a bar.
 *
 * Selecting "Belirli Gün" reveals a native `<input type="date">` — a real
 * calendar UI it, so its own popup positioning/viewport-containment is
 * the browser's job, not something this component needs to (or safely
 * could) reimplement.
 */
export function BoardDateFilter({ mode, day, onModeChange, onDayChange, groupLabel, specificDayInputLabel, labels }: BoardDateFilterProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap gap-2" role="group" aria-label={groupLabel}>
        {PRESET_MODES.map((presetMode) => {
          const selected = presetMode === mode;
          // EPIC — Duvar İçi Filtreleme: once a specific day is actually
          // chosen, the "Belirli Gün" pill shows that day (e.g.
          // "12.09.2026") instead of the generic label — the native date
          // input next to it already lets you change it, this just makes
          // the active selection legible without opening the picker again.
          const displayLabel =
            presetMode === "day" && selected ? (formatDateInputValueForDisplay(day) ?? labels[presetMode]) : labels[presetMode];
          return (
            <button
              key={presetMode}
              type="button"
              aria-pressed={selected}
              onClick={() => onModeChange(selected ? "none" : presetMode)}
              className={cn(
                "shrink-0 rounded-pill border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange",
                selected
                  ? "border-navy bg-navy text-white"
                  : "border-border bg-surface text-ink-soft hover:border-navy/40 hover:text-navy"
              )}
            >
              {displayLabel}
            </button>
          );
        })}
      </div>
      {mode === "day" && (
        <label className="flex items-center gap-1.5 text-xs text-ink-soft">
          <span className="sr-only">{specificDayInputLabel}</span>
          <input
            type="date"
            value={day}
            onChange={(event) => onDayChange(event.target.value)}
            aria-label={specificDayInputLabel}
            className="rounded-md border border-border bg-canvas px-2 py-1 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
          />
        </label>
      )}
    </div>
  );
}
