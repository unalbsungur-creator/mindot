"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/features/auth/auth";
import { getPublicMessageById } from "@/features/board/repository";
import { reportRepository } from "./repository";
import { REPORT_REASONS, type ReportReason } from "./types";

const MAX_DETAILS_LENGTH = 500;

export type ReportMessageError = "not-found" | "invalid-reason" | "already-reported" | "no-identity";

export interface ReportMessageResult {
  ok: boolean;
  error?: ReportMessageError;
}

/**
 * Files a report against a public message. Every fact this trusts is
 * re-derived or re-verified here, never taken from the client as-is:
 *
 * - The reporter's identity: a signed-in session's own `user.id` always
 *   wins over any client-supplied `anonymousId` (identical rule to
 *   `likeMessage` in features/messages/like-actions.ts, so a signed-in
 *   visitor can never end up reporting as two different identities).
 * - The message itself: `getPublicMessageById` re-fetches and re-checks
 *   `status === "approved"` server-side — the same function the public
 *   board/share/memory flows already use — so a pending, rejected, or
 *   archived messageId can never be reported, regardless of what a client
 *   claims about it. This also means an anonymous message's real author
 *   never enters this function at all (getPublicMessageById already
 *   strips it), so a report can never leak that identity.
 *
 * Filing a report never writes to `messages` — see reportRepository.create
 * and schema.ts's doc comment on `messageReports`: this is advisory input
 * for an admin, exactly like the AI pre-screen, never a removal decision
 * on its own.
 */
export async function reportMessage(input: {
  messageId: string;
  reason: ReportReason;
  details?: string;
  anonymousId?: string;
}): Promise<ReportMessageResult> {
  const session = await auth();
  const reporterId = session?.user?.id ?? null;
  const anonymousReporterId = reporterId ? null : (input.anonymousId ?? null);

  if (!reporterId && !anonymousReporterId) {
    return { ok: false, error: "no-identity" };
  }

  if (!REPORT_REASONS.includes(input.reason)) {
    return { ok: false, error: "invalid-reason" };
  }

  const message = await getPublicMessageById(input.messageId);
  if (!message) {
    return { ok: false, error: "not-found" };
  }

  const details = input.details?.trim().slice(0, MAX_DETAILS_LENGTH) || null;

  const report = await reportRepository.create({
    messageId: input.messageId,
    reporterId,
    anonymousReporterId,
    reason: input.reason,
    details,
  });

  if (!report) {
    return { ok: false, error: "already-reported" };
  }

  revalidatePath("/admin/reports");
  return { ok: true };
}

export type ReportReviewError = "unauthorized" | "not-found" | "already-reviewed";

export interface ReportReviewResult {
  ok: boolean;
  error?: ReportReviewError;
}

async function requireAdmin() {
  const session = await auth();
  if (session?.user?.role !== "admin") return null;
  return session.user;
}

/** Same shape as approveMessage/rejectMessage in features/messages/moderation-actions.ts: re-verify admin on every call, independent of the page-level gate. */
export async function resolveReport(id: string): Promise<ReportReviewResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "unauthorized" };

  const updated = await reportRepository.resolve(id, admin.id);
  if (!updated) return { ok: false, error: "already-reviewed" };

  revalidatePath("/admin/reports");
  return { ok: true };
}

export async function dismissReport(id: string): Promise<ReportReviewResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "unauthorized" };

  const updated = await reportRepository.dismiss(id, admin.id);
  if (!updated) return { ok: false, error: "already-reviewed" };

  revalidatePath("/admin/reports");
  return { ok: true };
}
