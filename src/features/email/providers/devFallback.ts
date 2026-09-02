import type { EmailSendResult, EmailService } from "../types";

/**
 * The development-safe default: no real email provider is configured
 * anywhere in this project, so this is what runs. It does NOT pretend to
 * send anything — every call fails with an honest `reason: "not-configured"`
 * rather than silently succeeding or silently dropping the email. Mirrors
 * features/moderation/providers/devFallback.ts's own honesty principle.
 */
export const PROVIDER_NAME = "dev-fallback";

class DevFallbackEmailService implements EmailService {
  async send(): Promise<EmailSendResult> {
    return { ok: false, reason: "not-configured" };
  }
}

export const devFallbackEmailService: EmailService = new DevFallbackEmailService();
