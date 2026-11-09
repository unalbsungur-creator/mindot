/**
 * MN-01 moderation alerts — the 5-minute cron tick, run by the Worker's own
 * `scheduled` handler (worker.ts), outside Next.
 *
 * Neon's free plan suspends an idle database; a cron that queried it every
 * five minutes would keep it awake forever. So the tick never touches the
 * database itself. It reads one small Cloudflare KV value — the "something is
 * pending" flag that every alert run leaves behind (dueFlag.ts) — and only
 * when a reminder or retry is actually due does it invoke the app (an
 * internal route that runs the database-backed evaluation). With the queue
 * empty there is no flag: the tick returns after one KV read, no query.
 *
 * The first alert of a cycle never waits for this tick — it is sent by the
 * event itself (a submission reaching the queue, trigger.ts). The cron only
 * carries reminders and retries.
 *
 * Deliberately free of imports from the app (no Next, no database client),
 * so the scheduled handler stays small and can't open a connection by
 * accident.
 */

export const ALERT_FLAG_KEY = "moderation-alerts:due";

/** The KV value: when the next reminder/retry becomes due (ISO 8601). */
export interface AlertDueFlag {
  dueAt: string;
}

/** The subset of a KV namespace the alert flag uses. */
export interface AlertFlagKv {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export type CronTickResult = "no-kv" | "no-flag" | "not-due" | "invoked" | "invoke-failed";

export function parseAlertDueFlag(raw: string | null): Date | null {
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw) as Partial<AlertDueFlag>;
    const due = new Date(String(value.dueAt));
    return Number.isNaN(due.getTime()) ? null : due;
  } catch {
    return null;
  }
}

export async function moderationAlertCronTick(options: {
  kv: AlertFlagKv | null | undefined;
  now: Date;
  /** Runs the database-backed evaluation (the internal route). Only called when something is due. */
  invoke: () => Promise<boolean>;
}): Promise<CronTickResult> {
  const { kv, now, invoke } = options;
  // Without the KV binding the cron can't know whether anything is pending — and must not ask the database.
  if (!kv) return "no-kv";
  const raw = await kv.get(ALERT_FLAG_KEY);
  if (raw === null) return "no-flag";
  const due = parseAlertDueFlag(raw);
  // An unreadable flag is treated as due: the run rewrites (or clears) it.
  if (due !== null && due.getTime() > now.getTime()) return "not-due";
  try {
    return (await invoke()) ? "invoked" : "invoke-failed";
  } catch {
    return "invoke-failed";
  }
}
