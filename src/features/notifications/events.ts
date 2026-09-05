import { TILE_PX } from "@/features/board/lib/worldGeometry";
import type { Message } from "@/features/messages/types";
import type { MessageReport } from "@/features/reports/types";
import { logAppError } from "@/lib/errorLogging";
import { notificationRepository } from "./repository";
import type { NewNotificationInput } from "./types";

/**
 * Same board-center math ArchivePageContent's own `boardLinkFor` already
 * uses (features/profile — that one lives in a client component, this one
 * runs server-side in an action, so it's a small standalone copy rather
 * than importing a client component's local helper). Never a new route —
 * `/board?x=&y=&z=` is the existing camera-position URL sync `useBoardCamera`
 * already reads.
 */
function boardLinkFor(tileX: number, tileY: number): string {
  const centerX = Math.round(tileX * TILE_PX + TILE_PX / 2);
  const centerY = Math.round(tileY * TILE_PX + TILE_PX / 2);
  return `/board?x=${centerX}&y=${centerY}&z=1`;
}

/**
 * Best-effort side effect: by the time any of the functions below run, the
 * moderation/report state change they're reacting to has ALREADY committed
 * successfully (see the `if (!updated) return ...` guard in every caller).
 * A failure here is logged via the app's one existing unexpected-error
 * sink, never thrown back into the caller — see "Event integration /
 * error-handling decision" in the EPIC 023 report for the full reasoning:
 * folding this into the same DB transaction as the state-changing UPDATE
 * would mean the messages/reports repositories reaching into the
 * notifications table (or vice versa), breaking the "each feature only
 * touches its own table" rule every repository in this codebase already
 * follows. The state transition is the durable, authoritative fact; a
 * dropped notification insert is a lost in-app convenience, not product
 * data corruption — the message/report themselves are never left in an
 * inconsistent state either way.
 */
async function safeCreate(input: NewNotificationInput): Promise<void> {
  try {
    await notificationRepository.create(input);
  } catch (error) {
    logAppError(error, { source: "server-request", routeType: "action" });
  }
}

/** Called only after messageRepository.approve() has already succeeded — see moderation-actions.ts. */
export async function notifyMessageApproved(message: Message): Promise<void> {
  const targetUrl =
    message.tileX !== null && message.tileY !== null ? boardLinkFor(message.tileX, message.tileY) : null;
  await safeCreate({ recipientUserId: message.authorId, type: "message_approved", messageId: message.id, targetUrl });
}

/** Called only after messageRepository.reject() has already succeeded. A rejected message never had a board placement, so this always links to the author's own archive instead. */
export async function notifyMessageRejected(message: Message): Promise<void> {
  await safeCreate({
    recipientUserId: message.authorId,
    type: "message_rejected",
    messageId: message.id,
    targetUrl: "/me/archive",
  });
}

/**
 * Called only after reportRepository.resolve()/dismiss() has already
 * succeeded. Silently a no-op when the report has no signed-in
 * `reporterId` — an anonymous reporter has no persistent identity to
 * address, and must never receive a notification (see CLAUDE.md's
 * "Anonymous vs named sharing" precedent for the same "no identity, no
 * delivery" rule elsewhere in this codebase). `message` is passed in
 * (already fetched by the caller) rather than re-queried here; a `null`
 * message (shouldn't normally happen — reports always reference a real
 * message row) just means no target link.
 */
async function notifyReporter(
  report: MessageReport,
  message: Message | null,
  type: "report_resolved" | "report_dismissed"
): Promise<void> {
  if (!report.reporterId) return;
  const targetUrl =
    message?.status === "approved" && message.tileX !== null && message.tileY !== null
      ? boardLinkFor(message.tileX, message.tileY)
      : null;
  await safeCreate({ recipientUserId: report.reporterId, type, reportId: report.id, messageId: report.messageId, targetUrl });
}

export async function notifyReportResolved(report: MessageReport, message: Message | null): Promise<void> {
  await notifyReporter(report, message, "report_resolved");
}

export async function notifyReportDismissed(report: MessageReport, message: Message | null): Promise<void> {
  await notifyReporter(report, message, "report_dismissed");
}
