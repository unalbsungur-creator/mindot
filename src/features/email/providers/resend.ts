import { optionalEnv, requireRuntimeEnv } from "@/lib/env";
import type { EmailSendResult, EmailService, SendEmailInput } from "../types";

export const RESEND_EMAILS_URL = "https://api.resend.com/emails";

/**
 * Resend's plain REST API via `fetch` — no SDK dependency added, matching
 * the "no unnecessary new dependency" constraint (Resend's API is a
 * single JSON POST, nothing a library buys us here that fetch doesn't
 * already do). Selected by EMAIL_PROVIDER=resend — see service.ts.
 * RESEND_API_KEY/EMAIL_FROM are read via requireRuntimeEnv (never
 * hardcoded, never sent to the client — this file only ever runs
 * server-side).
 *
 * Optional per-email fields (moderation alerts use them; invitation emails
 * send exactly the request they always did):
 * - `from` overrides EMAIL_FROM — then EMAIL_FROM isn't required;
 * - `replyTo` → Resend's `reply_to`;
 * - `idempotencyKey` → the `Idempotency-Key` header: Resend delivers one
 *   email per key (24 h), so a retry after a lost response can't double-send;
 * - `timeoutMs` aborts the request; a timeout is a failure (`resend-timeout`).
 *
 * The result never carries the address, the key or the response body.
 */
class ResendEmailService implements EmailService {
  constructor(private readonly fetchImpl: typeof fetch = (...args) => fetch(...args)) {}

  async send(input: SendEmailInput): Promise<EmailSendResult> {
    let apiKey: string;
    let from: string;
    try {
      apiKey = requireRuntimeEnv("RESEND_API_KEY");
      from = input.from ?? requireRuntimeEnv("EMAIL_FROM");
    } catch {
      // EMAIL_PROVIDER=resend was set without the keys it needs — treat
      // this the same as "not configured" rather than throwing out of a
      // Server Action.
      return { ok: false, reason: "not-configured" };
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };
    if (input.idempotencyKey) headers["Idempotency-Key"] = input.idempotencyKey;

    try {
      const response = await this.fetchImpl(RESEND_EMAILS_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({
          from,
          to: input.to,
          subject: input.subject,
          html: input.html,
          text: input.text,
          ...(input.replyTo ? { reply_to: input.replyTo } : {}),
        }),
        ...(input.timeoutMs ? { signal: AbortSignal.timeout(input.timeoutMs) } : {}),
      });

      if (!response.ok) {
        return { ok: false, reason: `resend-http-${response.status}` };
      }
      return { ok: true };
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      if (name === "TimeoutError" || name === "AbortError") return { ok: false, reason: "resend-timeout" };
      return { ok: false, reason: "resend-network-error" };
    }
  }
}

export const resendEmailService: EmailService = new ResendEmailService();

/** For tests: the same provider over a stubbed `fetch`. */
export function createResendEmailService(fetchImpl: typeof fetch): EmailService {
  return new ResendEmailService(fetchImpl);
}

/** Whether the Resend provider is selected and has an API key — values are never returned. */
export function isResendConfigured(): boolean {
  return process.env.EMAIL_PROVIDER === "resend" && Boolean(optionalEnv("RESEND_API_KEY"));
}
