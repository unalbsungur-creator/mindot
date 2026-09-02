import { devFallbackEmailService } from "./providers/devFallback";
import { resendEmailService } from "./providers/resend";
import type { EmailService } from "./types";

/**
 * Provider selection — the exact same shape as
 * features/moderation/service.ts's `getModerationService()`.
 * `EMAIL_PROVIDER` names which one to use; nothing is required to run —
 * the dev fallback is always available and is what runs when the var is
 * unset, which is the case everywhere this project has been run so far
 * (no real email provider credentials exist in this environment).
 *
 * To add a real provider: implement `EmailService` in a new file under
 * `providers/` (see `resend.ts`/`devFallback.ts` for the shape), branch
 * to it here behind its own env var value, and do not remove the dev
 * fallback — it's still what every environment without that provider's
 * credentials should fall back to.
 */
export function getEmailService(): EmailService {
  const provider = process.env.EMAIL_PROVIDER;

  switch (provider) {
    case "resend":
      return resendEmailService;
    default:
      return devFallbackEmailService;
  }
}
