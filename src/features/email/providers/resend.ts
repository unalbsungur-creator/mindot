import { requireRuntimeEnv } from "@/lib/env";
import type { EmailSendResult, EmailService, SendEmailInput } from "../types";

/**
 * Resend's plain REST API via `fetch` — no SDK dependency added, matching
 * the "no unnecessary new dependency" constraint (Resend's API is a
 * single JSON POST, nothing a library buys us here that fetch doesn't
 * already do). Selected by EMAIL_PROVIDER=resend — see service.ts.
 * RESEND_API_KEY/EMAIL_FROM are read via requireRuntimeEnv (never
 * hardcoded, never sent to the client — this file only ever runs
 * server-side, from a "use server" Server Action).
 */
class ResendEmailService implements EmailService {
  async send(input: SendEmailInput): Promise<EmailSendResult> {
    let apiKey: string;
    let from: string;
    try {
      apiKey = requireRuntimeEnv("RESEND_API_KEY");
      from = requireRuntimeEnv("EMAIL_FROM");
    } catch {
      // EMAIL_PROVIDER=resend was set without the keys it needs — treat
      // this the same as "not configured" rather than throwing out of a
      // Server Action.
      return { ok: false, reason: "not-configured" };
    }

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: input.to,
          subject: input.subject,
          html: input.html,
          text: input.text,
        }),
      });

      if (!response.ok) {
        return { ok: false, reason: `resend-http-${response.status}` };
      }
      return { ok: true };
    } catch {
      return { ok: false, reason: "resend-network-error" };
    }
  }
}

export const resendEmailService: EmailService = new ResendEmailService();
