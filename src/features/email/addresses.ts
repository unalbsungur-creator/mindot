/**
 * Where replies to MINDOT's emails go — invitations and moderation alerts
 * alike. Senders (EMAIL_FROM for invitations, MODERATION_ALERT_FROM for
 * alerts) are send-only addresses on the Resend-verified domain; replies
 * land in the support mailbox (Microsoft 365).
 */
export const SUPPORT_REPLY_TO = "destek@mind-ot.com";
