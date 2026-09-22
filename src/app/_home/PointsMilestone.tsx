"use client";

import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/Button";
import { useLocale } from "@/i18n/LocaleProvider";

/**
 * MINDOT's long-term goal, not a live operational metric — kept as a fixed
 * display constant here rather than in the database (nothing about "1
 * million" is stored/queried; it only shapes how the existing approved
 * count is framed).
 */
const POINTS_MILESTONE_TARGET = 1_000_000;

/**
 * A small, quiet milestone strip directly beneath the hero — reuses the
 * exact same live approved-count `page.tsx` already computes for
 * `HomeHero`'s `activeCountLabel` (`messageRepository.countApproved()`),
 * just framed against MINDOT's long-term 1,000,000-dot goal instead of a
 * plain running total. No second query, no client-side counting: `count`
 * is the one number, passed down from the server.
 *
 * Deliberately not a marketing banner — no gradient, no oversized card,
 * same restrained navy/orange vocabulary as HomeHero/MeaningStrip above
 * and below it, with only a thin top divider (matching MeaningStrip's own
 * `border-t border-white/10`) to separate it from the hero.
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
    <section className="relative border-t border-white/10 bg-navy py-8 sm:py-10">
      <PageContainer className="flex flex-col items-center gap-3 text-center">
        <h2 className="font-display text-xl font-medium text-white sm:text-2xl">
          {t.heading.replace("{target}", formattedTarget)}
        </h2>

        <div className="flex w-full max-w-md flex-col items-center gap-1.5">
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={POINTS_MILESTONE_TARGET}
            aria-valuenow={clampedCount}
            aria-label={progressLabel}
            className="h-2 w-full overflow-hidden rounded-full bg-white/10"
          >
            <div
              className="h-full rounded-full bg-orange transition-[width] duration-500 ease-[var(--ease-standard)]"
              style={{ width: `${percent}%` }}
            />
          </div>
          <span aria-hidden="true" className="text-xs text-white/60 tabular-nums">
            {progressLabel}
          </span>
        </div>

        <p className="max-w-md text-balance text-sm text-white/70">{t.body}</p>

        <Button href="/write" variant="secondary" size="sm">
          {dictionary.hero.primaryCta}
        </Button>
      </PageContainer>
    </section>
  );
}
