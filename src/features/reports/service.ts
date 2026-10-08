import { getPublicMessageById } from "@/features/board/repository";
import { reportRepository, type ReportRepository } from "./repository";
import { REPORT_REASONS, type ReportReason } from "./types";

const MAX_DETAILS_LENGTH = 500;

export type ReportMessageError = "not-found" | "invalid-reason" | "already-reported" | "no-identity" | "rate-limited";

// EPIC 018: filing a report never touches messages.status (see the doc
// comment below), so unrestricted report volume can't remove content on
// its own — but it can still waste an admin's time or be used to try to
// pressure removal by sheer volume. Generous enough that someone
// genuinely reporting several different bad posts in one browsing session
// is never blocked.
const REPORT_RATE_LIMIT_MAX = 10;
const REPORT_RATE_LIMIT_WINDOW_MINUTES = 10;

export interface ReportMessageResult {
  ok: boolean;
  error?: ReportMessageError;
}

export interface ReportMessageParams {
  messageId: string;
  reason: ReportReason;
  details?: string;
  /** The signed-in reporter, resolved by the caller from its session — `null` for an unauthenticated visitor. */
  reporterId: string | null;
  /** A visitor's client-generated id; ignored entirely whenever `reporterId` is set. */
  anonymousId?: string;
}

export interface ReportMessageDeps {
  reports: Pick<ReportRepository, "countRecentByIdentity" | "create">;
  /** Approved-and-placed messages only — the same check the public board/share/memory flows use. */
  getPublicMessage: (id: string) => Promise<unknown | null>;
}

const defaultDeps: ReportMessageDeps = {
  reports: reportRepository,
  getPublicMessage: getPublicMessageById,
};

/**
 * Files a report against a public message. Every fact this trusts is
 * re-derived or re-verified here, never taken from the client as-is:
 *
 * - The reporter's identity: a signed-in `reporterId` (from the caller's
 *   session) always wins over any client-supplied `anonymousId` (identical
 *   rule to `likeMessage` in features/messages/like-actions.ts, so a
 *   signed-in visitor can never end up reporting as two different
 *   identities). Anonymous reporting is allowed — no identity at all is
 *   `no-identity`, not an auth error.
 * - The message itself: `getPublicMessageById` re-fetches and re-checks
 *   `status === "approved"` server-side, so a pending, rejected, or
 *   archived messageId can never be reported, regardless of what a client
 *   claims about it. This also means an anonymous message's real author
 *   never enters this function at all (getPublicMessageById already
 *   strips it), so a report can never leak that identity.
 *
 * Filing a report never writes to `messages` — see reportRepository.create
 * and schema.ts's doc comment on `messageReports`: this is advisory input
 * for an admin, exactly like the AI pre-screen, never a removal decision
 * on its own.
 *
 * The check order is part of the contract: identity → rate limit → reason
 * → public message → duplicate.
 */
export async function reportMessageAsReporter(
  params: ReportMessageParams,
  deps: ReportMessageDeps = defaultDeps
): Promise<ReportMessageResult> {
  const reporterId = params.reporterId;
  const anonymousReporterId = reporterId ? null : (params.anonymousId ?? null);

  if (!reporterId && !anonymousReporterId) {
    return { ok: false, error: "no-identity" };
  }

  // EPIC 018: reads the server-resolved identity above, never anything the
  // client claims. Checked before any further validation or DB read below,
  // and before the DB insert.
  const recentCount = await deps.reports.countRecentByIdentity({ reporterId, anonymousReporterId }, REPORT_RATE_LIMIT_WINDOW_MINUTES);
  if (recentCount >= REPORT_RATE_LIMIT_MAX) {
    return { ok: false, error: "rate-limited" };
  }

  if (!REPORT_REASONS.includes(params.reason)) {
    return { ok: false, error: "invalid-reason" };
  }

  const message = await deps.getPublicMessage(params.messageId);
  if (!message) {
    return { ok: false, error: "not-found" };
  }

  const details = params.details?.trim().slice(0, MAX_DETAILS_LENGTH) || null;

  const report = await deps.reports.create({
    messageId: params.messageId,
    reporterId,
    anonymousReporterId,
    reason: params.reason,
    details,
  });

  if (!report) {
    return { ok: false, error: "already-reported" };
  }

  return { ok: true };
}
