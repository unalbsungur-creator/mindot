/**
 * MN-01: who may run the alert evaluation through the internal route — only
 * the Worker's own cron, which sends MODERATION_ALERT_CRON_SECRET in the
 * `x-mindot-cron` header. Anyone else gets a 404, so the route can't be used
 * from outside to wake the database. A missing or short secret disables the
 * route entirely.
 */

export const CRON_SECRET_HEADER = "x-mindot-cron";
export const MIN_CRON_SECRET_LENGTH = 32;

function constantTimeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  let diff = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i++) diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return diff === 0;
}

export function isAuthorizedCronRequest(headerValue: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < MIN_CRON_SECRET_LENGTH || !headerValue) return false;
  return constantTimeEqual(headerValue, secret);
}
