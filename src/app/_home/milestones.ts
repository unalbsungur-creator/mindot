/**
 * MB-01: the stops on the way to MINDOT's 1,000,000-dot goal. The homepage
 * sentence always names the final goal; the bar shows progress towards the
 * next stop, so it visibly moves at today's scale instead of sitting at
 * 0.0x% of a million.
 */
export const DOT_MILESTONES = [1_000, 10_000, 100_000, 1_000_000] as const;
export const FINAL_DOT_MILESTONE = DOT_MILESTONES[DOT_MILESTONES.length - 1];

export interface MilestoneProgress {
  /** The live count, cleaned up: a whole number, never negative. */
  count: number;
  /** The next stop above `count` — the final goal once every stop is passed. */
  next: number;
  /** 0–100, the bar's fill towards `next`. */
  percent: number;
  /** `count` has reached the final goal. */
  reached: boolean;
}

export function milestoneProgress(rawCount: number): MilestoneProgress {
  const count = Number.isFinite(rawCount) && rawCount > 0 ? Math.floor(rawCount) : 0;
  const next = DOT_MILESTONES.find((stop) => count < stop) ?? FINAL_DOT_MILESTONE;
  const reached = count >= FINAL_DOT_MILESTONE;
  return { count, next, percent: reached ? 100 : (count / next) * 100, reached };
}
