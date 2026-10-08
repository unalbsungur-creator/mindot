"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/features/auth/auth";
import { requireAdmin } from "@/features/auth/requireAdmin";
import { messageRepository } from "@/features/messages/repository";
import { notifyReportDismissed, notifyReportResolved } from "@/features/notifications/events";
import { reportRepository } from "./repository";
import { reportMessageAsReporter, type ReportMessageResult } from "./service";
import type { ReportReason } from "./types";

export type { ReportMessageError, ReportMessageResult } from "./service";

/**
 * The web entry point for reporting a public message (`ReportDialog`).
 * Only the session is read here — a signed-in account's id always wins
 * over the client's `anonymousId`, and anonymous reporting stays allowed —
 * while every rule (identity, rate limit, reason, public-message check,
 * details, duplicate) lives in reportMessageAsReporter (./service).
 */
export async function reportMessage(input: {
  messageId: string;
  reason: ReportReason;
  details?: string;
  anonymousId?: string;
}): Promise<ReportMessageResult> {
  const session = await auth();
  const result = await reportMessageAsReporter({ ...input, reporterId: session?.user?.id ?? null });

  if (result.ok) {
    revalidatePath("/admin/reports");
  }
  return result;
}

export type ReportReviewError = "unauthorized" | "not-found" | "already-reviewed";

export interface ReportReviewResult {
  ok: boolean;
  error?: ReportReviewError;
}

/** Same shape as approveMessage/rejectMessage in features/messages/moderation-actions.ts: re-verify admin on every call, independent of the page-level gate. */
export async function resolveReport(id: string): Promise<ReportReviewResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "unauthorized" };

  const updated = await reportRepository.resolve(id, admin.id);
  if (!updated) return { ok: false, error: "already-reviewed" };

  // EPIC 023: fired only after the resolve above has already committed.
  // notifyReportResolved is itself a no-op for an anonymous reporter (no
  // persistent identity to address) — see events.ts.
  const message = await messageRepository.getById(updated.messageId);
  await notifyReportResolved(updated, message);

  revalidatePath("/admin/reports");
  return { ok: true };
}

export async function dismissReport(id: string): Promise<ReportReviewResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "unauthorized" };

  const updated = await reportRepository.dismiss(id, admin.id);
  if (!updated) return { ok: false, error: "already-reviewed" };

  const message = await messageRepository.getById(updated.messageId);
  await notifyReportDismissed(updated, message);

  revalidatePath("/admin/reports");
  return { ok: true };
}
