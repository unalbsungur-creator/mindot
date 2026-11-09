import { getCloudflareContext } from "@opennextjs/cloudflare";
import { ALERT_FLAG_KEY, type AlertFlagKv } from "./cron";
import { runModerationAlerts, type AlertRunDependencies, type AlertRunSummary } from "./service";
import { REMINDER_INTERVAL_MS } from "./types";

/**
 * MN-01: after every alert run (event or cron), leave the KV flag the cron
 * reads (cron.ts) in step with what the database just said:
 *
 * - queue empty (cycle reset) or alerts disabled → no flag: the cron does
 *   nothing, not even a query, until the next submission;
 * - something will be due (a reminder in 30 minutes, a retry in 1/5/15) →
 *   flag at that time;
 * - the run failed (database or network) → flag "due now", so the next tick
 *   tries again.
 */

export type FlagAction = { action: "put"; dueAt: Date } | { action: "delete" };

export function alertFlagAfterRun(summary: AlertRunSummary, now: Date): FlagAction {
  if (summary.status === "error") return { action: "put", dueAt: now };
  if (summary.status === "disabled") return { action: "delete" };
  if (summary.pendingReviewCount === 0) return { action: "delete" };
  if (summary.nextDueAt) return { action: "put", dueAt: summary.nextDueAt };
  // The queue couldn't be read: look again on the next tick.
  if (summary.pendingReviewCount === null) return { action: "put", dueAt: now };
  // Queue non-empty but nothing scheduled: never drop reminders — look again within the reminder interval.
  return { action: "put", dueAt: new Date(now.getTime() + REMINDER_INTERVAL_MS) };
}

/** The Worker's KV binding, or null outside the Worker (next dev, tests) — then the flag is simply not kept. */
export function getAlertFlagKv(): AlertFlagKv | null {
  try {
    return (getCloudflareContext().env as { MODERATION_ALERTS_KV?: AlertFlagKv }).MODERATION_ALERTS_KV ?? null;
  } catch {
    return null;
  }
}

export async function recordAlertFlag(kv: AlertFlagKv | null, action: FlagAction): Promise<void> {
  if (!kv) return;
  if (action.action === "delete") await kv.delete(ALERT_FLAG_KEY);
  else await kv.put(ALERT_FLAG_KEY, JSON.stringify({ dueAt: action.dueAt.toISOString() }));
}

/** One alert run plus its flag update. Never throws. */
export async function runModerationAlertsAndRecord(
  deps: AlertRunDependencies & { kv?: AlertFlagKv | null; now?: () => Date } = {}
): Promise<AlertRunSummary> {
  const summary = await runModerationAlerts(deps);
  try {
    await recordAlertFlag(deps.kv !== undefined ? deps.kv : getAlertFlagKv(), alertFlagAfterRun(summary, (deps.now ?? (() => new Date()))()));
  } catch {
    console.error("[moderation-alerts] could not update the due flag");
  }
  return summary;
}
