/**
 * Security pack 2b, item 2 — limits on reports filed without an account.
 *
 * Reporting stays open to people without an account (someone a card is about
 * may have none), so a signed-out report is bounded by the network address it
 * came from instead of by an identity:
 * - at most {@link ANONYMOUS_REPORTS_PER_HOUR} reports per address per clock hour;
 * - at most one report per address per card per {@link SAME_CARD_WINDOW_SECONDS}.
 *
 * Privacy: the address itself is never stored anywhere. It is reduced to an
 * HMAC-SHA256 under a server secret (AUTH_SECRET, with a purpose label so the
 * value is useless for anything else), and only that keyed hash appears — as
 * part of a Cloudflare KV key whose `expirationTtl` makes Cloudflare delete it
 * on its own after at most 24 hours (the hourly counter after ~1 hour). No
 * address or address hash ever reaches the database: the report row itself
 * gets a fresh random reporter id, so reports can't be linked to each other
 * or to an address later.
 *
 * KV is eventually consistent across Cloudflare locations, so these limits
 * are best-effort against a determined, distributed sender — Turnstile (one
 * solved challenge per report) is the main barrier; this caps what a single
 * address can do.
 */

export const ANONYMOUS_REPORTS_PER_HOUR = 5;
export const SAME_CARD_WINDOW_SECONDS = 24 * 60 * 60;
const HOUR_SECONDS = 60 * 60;
/** Slack past the end of an hourly window before KV drops its counter (KV's minimum TTL is 60 s). */
const HOUR_KEY_TTL_SECONDS = HOUR_SECONDS + 120;

/** Key prefix inside the shared Worker KV namespace (the moderation-alert cron reads only its own key). */
export const REPORT_LIMIT_KEY_PREFIX = "report-limit:";
const HASH_LABEL = "mindot:report-ip:v1:";

/** The subset of a Workers KV namespace these limits use. */
export interface ReportLimitKv {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export type AnonymousLimitDecision = "allowed" | "rate-limited" | "already-reported";

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Keyed hash of a client address — never reversible without the server secret, and never stored beyond KV's TTL. */
export async function hashReporterAddress(address: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(HASH_LABEL + address.trim().toLowerCase()));
  return toHex(mac).slice(0, 32);
}

export function hourBucket(now: Date): number {
  return Math.floor(now.getTime() / 1000 / HOUR_SECONDS);
}

export function hourKey(addressHash: string, now: Date): string {
  return `${REPORT_LIMIT_KEY_PREFIX}h:${addressHash}:${hourBucket(now)}`;
}

export function cardKey(addressHash: string, messageId: string): string {
  return `${REPORT_LIMIT_KEY_PREFIX}m:${addressHash}:${messageId}`;
}

function countFrom(value: string | null): number {
  const parsed = value === null ? 0 : Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/** Before filing: is this address still within its limits for this card? */
export async function checkAnonymousReportLimits(
  kv: ReportLimitKv,
  addressHash: string,
  messageId: string,
  now: Date
): Promise<AnonymousLimitDecision> {
  const [sameCard, hourCount] = await Promise.all([kv.get(cardKey(addressHash, messageId)), kv.get(hourKey(addressHash, now))]);
  if (sameCard !== null) return "already-reported";
  if (countFrom(hourCount) >= ANONYMOUS_REPORTS_PER_HOUR) return "rate-limited";
  return "allowed";
}

/** After a report was filed: count it against the address (hour window + this card for 24 h). */
export async function recordAnonymousReport(kv: ReportLimitKv, addressHash: string, messageId: string, now: Date): Promise<void> {
  const key = hourKey(addressHash, now);
  const current = countFrom(await kv.get(key));
  await Promise.all([
    kv.put(key, String(current + 1), { expirationTtl: HOUR_KEY_TTL_SECONDS }),
    kv.put(cardKey(addressHash, messageId), "1", { expirationTtl: SAME_CARD_WINDOW_SECONDS }),
  ]);
}
