"use server";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@/features/auth/auth";
import { requireAdmin } from "@/features/auth/requireAdmin";
import { messageRepository } from "@/features/messages/repository";
import { notifyReportDismissed, notifyReportResolved } from "@/features/notifications/events";
import { pickTrustedRemoteIp } from "@/features/auth/lib/remoteIp";
import { verifyReportTurnstile } from "@/features/auth/lib/turnstile";
import { getPublicMessageById } from "@/features/board/repository";
import { resolveAppEnvironment } from "@/lib/appEnvironment";
import { optionalEnv } from "@/lib/env";
import { hashReporterAddress, type ReportLimitKv } from "./lib/anonymousReportLimits";
import { reportRepository } from "./repository";
import { reportMessageAsReporter, type AnonymousReportGate, type ReportMessageResult } from "./service";
import type { ReportReason } from "./types";

export type { ReportMessageError, ReportMessageResult } from "./service";

/**
 * The web entry point for reporting a public message (`ReportDialog`).
 * Security pack 2b: who reports is only ever the server's view — the
 * session's account, or, without one, the request's own Cloudflare client
 * address (CF-Connecting-IP only) reduced to a keyed hash for the limits —
 * never an id the client chooses. Every rule lives in
 * reportMessageAsReporter (./service).
 */
export async function reportMessage(input: {
  messageId: string;
  reason: ReportReason;
  details?: string;
  turnstileToken?: string;
}): Promise<ReportMessageResult> {
  const session = await auth();
  const reporterId = session?.user?.id ?? null;
  const result = await reportMessageAsReporter(
    {
      messageId: input.messageId,
      reason: input.reason,
      details: input.details,
      reporterId,
      turnstileToken: input.turnstileToken,
    },
    {
      reports: reportRepository,
      getPublicMessage: getPublicMessageById,
      anonymous: reporterId ? null : await anonymousReportGate(),
    }
  );

  if (result.ok) {
    revalidatePath("/admin/reports");
  }
  return result;
}

/** The Worker's KV namespace, or null outside the Worker (next dev, tests). */
function reportLimitKv(): ReportLimitKv | null {
  try {
    return (getCloudflareContext().env as { MODERATION_ALERTS_KV?: ReportLimitKv }).MODERATION_ALERTS_KV ?? null;
  } catch {
    return null;
  }
}

async function anonymousReportGate(): Promise<AnonymousReportGate> {
  let remoteIp: string | null = null;
  try {
    remoteIp = pickTrustedRemoteIp(await headers());
  } catch {
    remoteIp = null;
  }
  const kv = reportLimitKv();
  const secret = optionalEnv("AUTH_SECRET");
  const addressHash = remoteIp && secret ? await hashReporterAddress(remoteIp, secret) : null;
  return {
    verifyTurnstile: (token) => verifyReportTurnstile(token, remoteIp),
    limiter: kv && addressHash ? { kv, addressHash } : null,
    // Deployed (staging/production): no limiter, no signed-out report.
    limiterRequired: resolveAppEnvironment() !== "development",
    now: new Date(),
    newReporterId: () => `anon-${crypto.randomUUID()}`,
  };
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
