export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  /**
   * Sender for this email only (e.g. "MINDOT Bildirim <bildirim@mind-ot.com>"
   * for moderation alerts). Omitted: the provider's EMAIL_FROM — what
   * invitation emails keep using.
   */
  from?: string;
  /** Reply-To address. Omitted: none (replies go to `from`). */
  replyTo?: string;
  /**
   * The provider's idempotency key: a second request with the same key is
   * not delivered twice (a retry whose first response was lost). Omitted:
   * no idempotency (invitation emails).
   */
  idempotencyKey?: string;
  /** Abort the provider request after this many ms (counts as a failure). Omitted: no timeout. */
  timeoutMs?: number;
}

export type EmailSendResult = { ok: true } | { ok: false; reason: string };

/**
 * Same abstraction shape as features/moderation's `ModerationService` —
 * one interface, provider selected by an env var (see service.ts), a
 * dev-fallback that's honest about not really sending anything. Kept
 * generic (not invitation-specific) so a future feature that needs to
 * send an email doesn't need a second provider system.
 */
export interface EmailService {
  send(input: SendEmailInput): Promise<EmailSendResult>;
}
