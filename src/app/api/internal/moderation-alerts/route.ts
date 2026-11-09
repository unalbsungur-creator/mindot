import { CRON_SECRET_HEADER, isAuthorizedCronRequest } from "@/features/moderation/alerts/cronAuth";
import { runModerationAlertsAndRecord } from "@/features/moderation/alerts/dueFlag";

export const dynamic = "force-dynamic";

/**
 * MN-01: the database-backed alert run for the Worker's 5-minute cron
 * (worker.ts → features/moderation/alerts/cron.ts). The cron only calls this
 * when its KV flag says a reminder or retry is due, so an empty queue never
 * reaches the database. Without the cron secret: 404, nothing runs.
 * The response carries counts only — no address, hash, key or token.
 */
export async function POST(request: Request): Promise<Response> {
  if (!isAuthorizedCronRequest(request.headers.get(CRON_SECRET_HEADER), process.env.MODERATION_ALERT_CRON_SECRET)) {
    return new Response("Not found", { status: 404 });
  }
  const summary = await runModerationAlertsAndRecord();
  return Response.json(
    {
      status: summary.status,
      reason: summary.reason ?? null,
      attempted: summary.attempted,
      delivered: summary.delivered,
      failed: summary.failed,
      stale: summary.stale,
      nextDueAt: summary.nextDueAt?.toISOString() ?? null,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
