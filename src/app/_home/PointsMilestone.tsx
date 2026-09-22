"use client";

import { useLocale } from "@/i18n/LocaleProvider";

/**
 * MINDOT's long-term goal, not a live operational metric — kept as a fixed
 * display constant here rather than in the database (nothing about "1
 * million" is stored/queried; it only shapes how the existing approved
 * count is framed).
 */
const POINTS_MILESTONE_TARGET = 1_000_000;

/**
 * A compact 1,000,000-dot progress readout, embedded directly inside
 * HomeHero's center column (right beneath its own live active-count line)
 * rather than a separate section — EPIC: Homepage Hero + 1,000,000 Points
 * Compact Layout asked for the first viewport to stay short, so this has
 * no `<section>`/background/border of its own and no CTA (the hero's
 * existing "Bir Nokta Bırak" button already covers that). Reuses the exact
 * same live approved-count `page.tsx` passes into `HomeHero` as
 * `activeCount` (`messageRepository.countApproved()`) — no second query,
 * no client-side counting.
 */
export function PointsMilestone({ count }: { count: number }) {
  const { locale, dictionary } = useLocale();
  const t = dictionary.pointsMilestone;

  // Defensive clamp: a negative/NaN count (shouldn't happen — countApproved
  // is a plain `count(*)`) never produces a negative-width bar or a
  // nonsensical aria value.
  const safeCount = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  const clampedCount = Math.min(safeCount, POINTS_MILESTONE_TARGET);
  const percent = (clampedCount / POINTS_MILESTONE_TARGET) * 100;

  const formatter = new Intl.NumberFormat(locale);
  const formattedTarget = formatter.format(POINTS_MILESTONE_TARGET);
  // The visible/aria count intentionally shows the real, uncapped total
  // (e.g. past 1,000,000) even though the bar itself stays capped at 100%.
  const formattedCount = formatter.format(safeCount);
  const progressLabel = t.progressLabel.replace("{count}", formattedCount).replace("{target}", formattedTarget);

  return (
    <div className="flex w-full max-w-sm flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-white/70">{t.heading.replace("{target}", formattedTarget)}</span>
        <span className="text-xs text-white/50 tabular-nums">{progressLabel}</span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={POINTS_MILESTONE_TARGET}
        aria-valuenow={clampedCount}
        aria-label={progressLabel}
        className="h-1.5 w-full overflow-hidden rounded-full bg-white/10"
      >
        <div
          className="h-full rounded-full bg-orange transition-[width] duration-500 ease-[var(--ease-standard)]"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-xs leading-snug text-white/55">{t.body}</p>
    </div>
  );
}
