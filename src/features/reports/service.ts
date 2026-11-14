import { getPublicMessageById } from "@/features/board/repository";
import { reportRepository, type ReportRepository } from "./repository";
import { checkAnonymousReportLimits, recordAnonymousReport, type ReportLimitKv } from "./lib/anonymousReportLimits";
import { REPORT_REASONS, type ReportReason } from "./types";

const MAX_DETAILS_LENGTH = 500;

export type ReportMessageError =
  | "not-found"
  | "invalid-reason"
  | "already-reported"
  | "rate-limited"
  | "verification-failed"
  | "unavailable";

// EPIC 018: filing a report never touches messages.status (see the doc
// comment below), so unrestricted report volume can't remove content on
// its own — but it can still waste an admin's time or be used to try to
// pressure removal by sheer volume. Generous enough that someone
// genuinely reporting several different bad posts in one browsing session
// is never blocked. (Signed-in reporters; signed-out ones have their own,
// stricter limits — see ./lib/anonymousReportLimits.)
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
  /** The signed-in reporter, resolved by the caller from its session — `null` for a visitor without an account. */
  reporterId: string | null;
  /** Signed-out reports only: the solved Turnstile challenge (`report` action). Ignored for a signed-in reporter. */
  turnstileToken?: string;
}

/**
 * What a signed-out report needs, resolved by the caller from the request
 * (never from anything the client claims): the Turnstile check, and the
 * per-address limiter — `null` when it isn't available (no KV binding or no
 * trusted client address). `limiterRequired` is true wherever the limits
 * must hold (a deployed Worker): there a missing limiter refuses the report
 * rather than letting it through unbounded.
 */
export interface AnonymousReportGate {
  verifyTurnstile: (token: string) => Promise<boolean>;
  limiter: { kv: ReportLimitKv; addressHash: string } | null;
  limiterRequired: boolean;
  now: Date;
  /** A fresh, random reporter id per signed-out report — never linkable to an address or another report. */
  newReporterId: () => string;
}

export interface ReportMessageDeps {
  reports: Pick<ReportRepository, "countRecentByIdentity" | "create">;
  /** Approved-and-placed messages only — the same check the public board/share/memory flows use. */
  getPublicMessage: (id: string) => Promise<unknown | null>;
  /** Required for a signed-out report; without it such a report is `unavailable`. */
  anonymous?: AnonymousReportGate | null;
}

const defaultDeps: ReportMessageDeps = {
  reports: reportRepository,
  getPublicMessage: getPublicMessageById,
};

/**
 * Files a report against a public message. Every fact this trusts is
 * re-derived or re-verified here, never taken from the client as-is:
 *
 * - Who reports: a signed-in `reporterId` from the caller's session — one
 *   report per account per card (the partial unique index
 *   message_reports_message_reporter_idx) and at most 10 per 10 minutes.
 *   Without an account (security pack 2b) a report is still allowed —
 *   someone a card is about may have none — but it needs a solved
 *   Turnstile challenge and stays within the per-address limits of
 *   ./lib/anonymousReportLimits (5 per hour, one per card per 24 h). It is
 *   stored under a fresh random reporter id: no address, no client id.
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
 * Check order: reason → (account: rate limit | no account: Turnstile →
 * address limits) → public message → insert (duplicate) → count it.
 */
export async function reportMessageAsReporter(
  params: ReportMessageParams,
  deps: ReportMessageDeps = defaultDeps
): Promise<ReportMessageResult> {
  const reporterId = params.reporterId;

  if (!REPORT_REASONS.includes(params.reason)) {
    return { ok: false, error: "invalid-reason" };
  }

  let anonymousReporterId: string | null = null;
  let gate: AnonymousReportGate | null = null;
  if (reporterId) {
    // EPIC 018: the server-resolved account, never anything the client claims.
    const recentCount = await deps.reports.countRecentByIdentity({ reporterId, anonymousReporterId: null }, REPORT_RATE_LIMIT_WINDOW_MINUTES);
    if (recentCount >= REPORT_RATE_LIMIT_MAX) {
      return { ok: false, error: "rate-limited" };
    }
  } else {
    gate = deps.anonymous ?? null;
    if (!gate) return { ok: false, error: "unavailable" };
    const token = typeof params.turnstileToken === "string" ? params.turnstileToken : "";
    if (!token || !(await gate.verifyTurnstile(token))) {
      return { ok: false, error: "verification-failed" };
    }
    if (gate.limiter) {
      let decision;
      try {
        decision = await checkAnonymousReportLimits(gate.limiter.kv, gate.limiter.addressHash, params.messageId, gate.now);
      } catch {
        // Limits that can't be checked don't hold: refuse rather than let it through.
        return { ok: false, error: "unavailable" };
      }
      if (decision !== "allowed") return { ok: false, error: decision };
    } else if (gate.limiterRequired) {
      return { ok: false, error: "unavailable" };
    }
    anonymousReporterId = gate.newReporterId();
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

  if (gate?.limiter) {
    try {
      await recordAnonymousReport(gate.limiter.kv, gate.limiter.addressHash, params.messageId, gate.now);
    } catch {
      // The report itself is filed; only this one isn't counted.
      console.warn("[reports] could not record a signed-out report against its address limit");
    }
  }

  return { ok: true };
}
