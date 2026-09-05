import Link from "next/link";
import type { Notification, NotificationType } from "@/features/notifications/types";
import type { Dictionary } from "@/i18n/translations";
import { cn } from "@/lib/cn";

/**
 * Notification copy is derived from `type` here, at render time, via the
 * dictionary — never stored pre-rendered server-side. Same "enum in the DB,
 * label from the dictionary" shape as `moderation.statusPending`/etc.
 * elsewhere in this codebase; see schema.ts's `notificationTypeEnum` comment
 * for why. Interface language and a notification's own copy are the same
 * concept here (unlike a thought's content language), so no separate
 * per-notification language field is needed.
 */
export function notificationTitleFor(dictionary: Dictionary, type: NotificationType): string {
  return {
    message_approved: dictionary.notifications.typeMessageApproved,
    message_rejected: dictionary.notifications.typeMessageRejected,
    report_resolved: dictionary.notifications.typeReportResolved,
    report_dismissed: dictionary.notifications.typeReportDismissed,
  }[type];
}

interface NotificationRowProps {
  notification: Notification;
  dictionary: Dictionary;
  locale: string;
  /** Called for a click-to-navigate (targetUrl present) or an explicit "mark as read" control (no targetUrl) — a no-op for an already-read notification either way, since the caller only renders the control while unread. */
  onMarkRead: (id: string) => void;
  /** Closes the bell's popover on navigation — unused by the full-history page. */
  onNavigate?: () => void;
}

/**
 * Shared between NotificationBell's dropdown and the /notifications
 * full-history page — one presentational renderer, not two independent
 * item templates that could drift out of sync. Unread/read is never
 * color-only: an unread row also carries bolder text and an
 * `aria-hidden` dot paired with sr-only text (same pattern as AdminNav's
 * numeric badges), and read/unread state is exposed via `aria-current`-free
 * plain sr-only text rather than relying on the dot's presence alone.
 */
export function NotificationRow({ notification, dictionary, locale, onMarkRead, onNavigate }: NotificationRowProps) {
  const isUnread = !notification.readAt;
  const title = notificationTitleFor(dictionary, notification.type);
  const timestamp = new Date(notification.createdAt).toLocaleString(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const body = (
    <div className={cn("flex flex-col gap-0.5 px-4 py-3 text-sm", isUnread && "bg-orange-tint/30")}>
      <div className="flex items-start justify-between gap-2">
        <span className={cn("min-w-0 flex-1 break-words", isUnread ? "font-semibold text-navy" : "font-medium text-ink-soft")}>
          {title}
        </span>
        {isUnread && <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-orange" />}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="text-xs text-ink-soft">
          {timestamp}
          {isUnread && <span className="sr-only"> — {dictionary.notifications.unreadBadgeLabel}</span>}
        </span>
        {isUnread && !notification.targetUrl && (
          <button
            type="button"
            onClick={() => onMarkRead(notification.id)}
            className="text-xs font-medium text-navy hover:text-orange focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
          >
            {dictionary.notifications.markAsRead}
          </button>
        )}
      </div>
    </div>
  );

  if (notification.targetUrl) {
    return (
      <li className="border-b border-border last:border-b-0">
        <Link
          href={notification.targetUrl}
          onClick={() => {
            if (isUnread) onMarkRead(notification.id);
            onNavigate?.();
          }}
          className="block transition-colors hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange"
        >
          {body}
        </Link>
      </li>
    );
  }

  return <li className="border-b border-border last:border-b-0">{body}</li>;
}
