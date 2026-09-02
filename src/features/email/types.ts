export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
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
