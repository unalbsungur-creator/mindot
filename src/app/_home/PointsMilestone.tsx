"use client";

import { useLocale } from "@/i18n/LocaleProvider";
import { FINAL_DOT_MILESTONE, milestoneProgress } from "./milestones";

/**
 * A compact progress readout, embedded directly inside HomeHero's center
 * column rather than a separate section — EPIC: Homepage Hero + 1,000,000
 * Points Compact Layout asked for the first viewport to stay short, so
 * this has no `<section>`/background/border of its own and no CTA (the
 * hero's existing "Bir Nokta Bırak" button already covers that). Reuses
 * the exact same live approved count `page.tsx` passes into `HomeHero` as
 * `activeCount` (`messageRepository.countApproved()`) — no second query,
 * no client-side counting.
 *
 * MB-01: the sentence ("1 Milyon Mindot'a doğru — şu ana kadar {n} nokta
 * bırakıldı.") always names the final goal; the bar fills towards the
 * next stop (milestones.ts: 1.000 → 10.000 → 100.000 → 1.000.000), named
 * in the small line under it.
 */
export function PointsMilestone({ count }: { count: number }) {
  const { locale, dictionary } = useLocale();
  const t = dictionary.pointsMilestone;
  const progress = milestoneProgress(count);

  const formatter = new Intl.NumberFormat(locale);
  // The visible count is the real total, even past the final goal.
  const formattedCount = formatter.format(progress.count);
  const progressLabel = t.progress.replace("{count}", formattedCount);
  const [before, after = ""] = t.progress.split("{count}");
  const nextStop = progress.reached ? t.goalReached : t.nextStop.replace("{target}", formatter.format(progress.next));

  return (
    <div className="flex w-full max-w-md flex-col gap-2">
      <p className="text-sm leading-snug text-white/75">
        {before}
        <span className="font-semibold text-orange tabular-nums">{formattedCount}</span>
        {after}
      </p>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={progress.reached ? FINAL_DOT_MILESTONE : progress.next}
        aria-valuenow={Math.min(progress.count, progress.next)}
        aria-label={progressLabel}
        aria-valuetext={`${formattedCount} — ${nextStop}`}
        className="h-1.5 w-full overflow-hidden rounded-full bg-white/10"
      >
        <div
          className="h-full rounded-full bg-orange transition-[width] duration-500 ease-[var(--ease-standard)]"
          style={{ width: `${progress.percent}%` }}
        />
      </div>
      <p className="text-xs text-white/55">{nextStop}</p>
    </div>
  );
}
