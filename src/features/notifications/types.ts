export type NotificationType = "message_approved" | "message_rejected" | "report_resolved" | "report_dismissed";

export const NOTIFICATION_TYPES: NotificationType[] = [
  "message_approved",
  "message_rejected",
  "report_resolved",
  "report_dismissed",
];

export interface Notification {
  id: string;
  recipientUserId: string;
  type: NotificationType;
  messageId: string | null;
  reportId: string | null;
  /** Precomputed at creation time from an already-public destination — see events.ts. Null renders safely non-clickable. */
  targetUrl: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NewNotificationInput {
  recipientUserId: string;
  type: NotificationType;
  messageId?: string | null;
  reportId?: string | null;
  targetUrl?: string | null;
}

export interface NotificationPage {
  items: Notification[];
  total: number;
}
