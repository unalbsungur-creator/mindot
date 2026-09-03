export type ReportReason = "spam" | "harassment" | "hate" | "sexual_content" | "violence" | "illegal" | "copyright" | "other";
export type ReportStatus = "open" | "resolved" | "dismissed";

export const REPORT_REASONS: ReportReason[] = [
  "spam",
  "harassment",
  "hate",
  "sexual_content",
  "violence",
  "illegal",
  "copyright",
  "other",
];

export interface MessageReport {
  id: string;
  messageId: string;
  reporterId: string | null;
  anonymousReporterId: string | null;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
}

export interface NewReportInput {
  messageId: string;
  reporterId: string | null;
  anonymousReporterId: string | null;
  reason: ReportReason;
  details: string | null;
}

/**
 * The admin queue's one read shape — a report plus just enough about the
 * message it's about to render a real `Note` preview and know its current
 * moderation status, exactly like `ModerationQueue`'s cards already do.
 * Never includes the reported message's real author identity beyond what
 * admins already see elsewhere (moderation queue shows full author data
 * regardless of anonymity — that's an existing, unrelated admin privilege,
 * not something this feature introduces).
 */
export interface ReportQueueItem {
  report: MessageReport;
  message: {
    id: string;
    content: string;
    templateId: string;
    language: string;
    authorName: string;
    isAnonymous: boolean;
    status: string;
  } | null;
  /**
   * "user": a real, signed-in reporter — `reporterName` is their real
   * name/email. "anonymous": an unauthenticated visitor's client-side
   * identity — `reporterName` is always null; never attempt to resolve or
   * display anything about who they are. The admin UI is what turns this
   * into a translated label ("Anonymous"/"Anonim"/...), not this layer.
   */
  reporterKind: "user" | "anonymous";
  reporterName: string | null;
}
