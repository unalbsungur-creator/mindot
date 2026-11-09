import { getEmailService } from "@/features/email/service";
import type { EmailService } from "@/features/email/types";
import { readModerationAlertConfig, type ModerationAlertRuntime } from "./config";
import { moderationAlertEmailContent } from "./lib/alertEmailTemplate";
import {
  completeAlertSend,
  evaluateAndClaimAlerts,
  releaseAlertLease,
  type AlertClaim,
  type AlertEvaluation,
  type ClaimedSend,
} from "./repository";
import { SEND_TIMEOUT_MS } from "./types";

/**
 * MN-01: one moderation-alert run — evaluate, claim, deliver, record. The
 * entry point for the event triggers (a submission or revision reaching the
 * queue) and the cron.
 *
 * - Never throws: every failure becomes `{ status: "error" }`, so a caller
 *   (a user's card submission) can't be broken by an alert.
 * - Every email goes through the existing EmailService (Resend), with the
 *   send's idempotency key, Reply-To and a 10 s timeout.
 * - The email states only the claimed pending count and the
 *   /admin/moderation link (lib/alertEmailTemplate.ts).
 * - Logs carry counts and outcomes only — never an address, a hash, a key
 *   or a token.
 */

export interface AlertRunSummary {
  status: "sent" | "idle" | "disabled" | "error";
  /** Why nothing (more) was sent: the last evaluation's reason. */
  reason?: string;
  attempted: number;
  delivered: number;
  failed: number;
  /** Completions rejected as stale (lease lost or cycle moved on). */
  stale: number;
  /** When the next reminder or retry becomes due, if any — the cron's wake-up hint. */
  nextDueAt: Date | null;
  pendingReviewCount: number | null;
}

/** Claims handled per run at most — a claim covers one kind (initial / retry / reminder); a few are enough to drain them. */
const MAX_CLAIMS_PER_RUN = 3;

export interface AlertRunDependencies {
  config?: ModerationAlertRuntime;
  email?: EmailService;
  evaluate?: (config: ModerationAlertRuntime["state"]) => Promise<AlertEvaluation>;
  complete?: (claim: AlertClaim, send: ClaimedSend, delivered: boolean) => Promise<boolean>;
  release?: (claim: AlertClaim) => Promise<boolean>;
}

async function deliver(runtime: ModerationAlertRuntime, email: EmailService, send: ClaimedSend): Promise<boolean> {
  const address = runtime.addresses.get(send.addressHash);
  if (!address) return false;
  const content = moderationAlertEmailContent({
    kind: send.templateKind,
    pendingReviewCount: send.claimedCount,
    adminModerationUrl: runtime.adminModerationUrl,
    environment: runtime.environment,
  });
  if (!content.ok) return false;
  try {
    const result = await email.send({
      to: address,
      from: runtime.from,
      replyTo: runtime.replyTo,
      subject: content.content.subject,
      html: content.content.html,
      text: content.content.text,
      idempotencyKey: send.idempotencyKey,
      timeoutMs: SEND_TIMEOUT_MS,
    });
    return result.ok;
  } catch {
    return false;
  }
}

export async function runModerationAlerts(deps: AlertRunDependencies = {}): Promise<AlertRunSummary> {
  const summary: AlertRunSummary = { status: "idle", attempted: 0, delivered: 0, failed: 0, stale: 0, nextDueAt: null, pendingReviewCount: null };
  try {
    const runtime = deps.config ?? (await readModerationAlertConfig());
    const email = deps.email ?? getEmailService();
    const evaluate = deps.evaluate ?? evaluateAndClaimAlerts;
    const complete = deps.complete ?? completeAlertSend;
    const release = deps.release ?? releaseAlertLease;

    for (let round = 0; round < MAX_CLAIMS_PER_RUN; round++) {
      const evaluation = await evaluate(runtime.state);
      summary.pendingReviewCount = evaluation.pendingReviewCount;
      if (evaluation.status === "idle") {
        summary.reason = evaluation.reason;
        summary.nextDueAt = evaluation.nextDueAt;
        if (evaluation.reason === "alerts-disabled") summary.status = summary.attempted > 0 ? "sent" : "disabled";
        break;
      }
      const { claim } = evaluation;
      const outcomes = await Promise.all(claim.sends.map((send) => deliver(runtime, email, send)));
      for (let i = 0; i < claim.sends.length; i++) {
        summary.attempted += 1;
        if (outcomes[i]) summary.delivered += 1;
        else summary.failed += 1;
        if (!(await complete(claim, claim.sends[i], outcomes[i]))) summary.stale += 1;
      }
      await release(claim);
      summary.status = "sent";
    }
    console.info(
      `[moderation-alerts] ${summary.status}${summary.reason ? ` (${summary.reason})` : ""}: ${summary.delivered}/${summary.attempted} delivered, ${summary.stale} stale`
    );
    return summary;
  } catch (error) {
    console.error(`[moderation-alerts] run failed: ${error instanceof Error ? error.name : "unknown error"}`);
    return { ...summary, status: "error" };
  }
}
