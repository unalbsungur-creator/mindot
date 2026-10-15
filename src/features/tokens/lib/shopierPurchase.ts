/**
 * Database-free rules for recording a Shopier Token purchase by hand (Token
 * Al V1): the buyer paid on Shopier, an admin checked the order and now
 * credits the package. Nothing here talks to Shopier. The repository
 * (`creditShopierPurchase`) applies these inside its transaction.
 */

/** `token_ledger.external_provider` for every Shopier purchase entry. */
export const SHOPIER_PROVIDER = "shopier";
/** `token_ledger.reference_type`; `reference_id` holds the package id (e.g. "tokens-50"). */
export const SHOPIER_PURCHASE_REFERENCE_TYPE = "shopier_order";

const ORDER_REF_PATTERN = /^[A-Z0-9-]{3,64}$/;
const MAX_EMAIL_LENGTH = 254;
/** The manual-review reason an admin must give when the emails differ. */
export const MAX_MANUAL_REVIEW_REASON_LENGTH = 300;
/** The admin's optional free-text note. Reason + note stay well inside the history view. */
export const MAX_PURCHASE_NOTE_LENGTH = 500;

/**
 * The one canonical form of a Shopier order number, or `null`: trimmed,
 * upper-cased, 3–64 of A–Z, 0–9 and "-". Every lookup and the unique
 * `(external_provider, external_reference)` index see this form, so
 * " ab-12 " and "AB-12" are the same order.
 */
export function normalizeShopierOrderRef(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return ORDER_REF_PATTERN.test(normalized) ? normalized : null;
}

/**
 * Server-derived from the order alone — never from the client, the admin
 * or the account: the same order always yields the same key, from any
 * dialog or admin, and the key names no user (it outlives an account
 * deletion unchanged, migration 0022).
 */
export function shopierPurchaseIdempotencyKey(orderRef: string): string {
  return `${SHOPIER_PURCHASE_REFERENCE_TYPE}:${orderRef}`;
}

/**
 * An email address in comparable form, or `null`: trimmed, lower-cased,
 * one "@" with something on both sides, no whitespace, at most 254
 * characters. For comparison only — a buyer's email is never stored.
 */
export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.length > MAX_EMAIL_LENGTH || /\s/u.test(normalized)) return null;
  const at = normalized.indexOf("@");
  if (at <= 0 || at !== normalized.lastIndexOf("@") || at === normalized.length - 1) return null;
  return normalized;
}

export type ShopierEmailCheck = "matched" | "manual_review";

/** Trimmed, length-capped free text, or `null` when empty. */
function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, maxLength).trim();
  return trimmed || null;
}

/** The manual-review reason, or `null` when missing/blank (which means: no manual review). */
export function cleanManualReviewReason(value: unknown): string | null {
  return cleanText(value, MAX_MANUAL_REVIEW_REASON_LENGTH);
}

/**
 * Removes every occurrence of `email` (case-insensitive) from `text`. A
 * regex rather than indexOf on a lower-cased copy: lower-casing can change
 * a string's length (Turkish "İ" becomes two code units), which would
 * shift every index after it.
 */
function withoutEmail(text: string, email: string): string {
  const escaped = email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(escaped, "giu"), "[e-posta]");
}

/**
 * The purchase entry's `note`: how the account was matched, the reason when
 * an admin overrode a mismatch, then the admin's own note. The buyer's
 * email is the one personal value that must not reach the ledger (whose
 * rows outlive an account deletion), so any copy of it typed into the
 * reason or the note is replaced; the account's own email is removed the
 * same way.
 */
export function buildShopierPurchaseNote(input: {
  emailCheck: ShopierEmailCheck;
  manualReviewReason: string | null;
  adminNote: string | null;
  /** Normalized emails to keep out of the note. */
  redactEmails: string[];
}): string {
  const scrub = (text: string) => input.redactEmails.filter(Boolean).reduce(withoutEmail, text);
  const head =
    input.emailCheck === "matched"
      ? "email: matched"
      : `email: manual review — ${scrub(input.manualReviewReason ?? "")}`;
  const note = cleanText(input.adminNote, MAX_PURCHASE_NOTE_LENGTH);
  return note ? `${head} | ${scrub(note)}` : head;
}
