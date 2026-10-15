/**
 * The Shopier crediting commitment (B9, decided 2026-10-15) as pure rules:
 * Tokens are credited within 24 continuous hours (not business days) of the
 * payment being confirmed on Shopier, and an admin reminder is due once 12
 * hours have passed with the order still uncredited.
 *
 * NOT WIRED YET. MINDOT only learns about a Shopier order when an admin
 * records it, so no stored "payment confirmed at" exists, nothing is
 * scheduled (no cron trigger / scheduled handler) and no reminder is sent.
 * Whatever later supplies pending orders (a Shopier notification, or an
 * admin entering the order when it arrives), a scheduled job and an email
 * provider must call these — never re-derive the hours elsewhere.
 */

const HOUR_MS = 60 * 60 * 1000;

/** Hours from payment confirmation to the latest crediting time (continuous hours). */
export const CREDIT_DEADLINE_HOURS = 24;
/** Hours from payment confirmation after which an uncredited order needs an admin reminder. */
export const ADMIN_REMINDER_AFTER_HOURS = 12;

/** One Shopier order as a reminder job would see it. */
export interface PendingShopierOrder {
  /** When Shopier confirmed the payment; null while the payment isn't confirmed — then no clock runs. */
  paymentConfirmedAt: Date | null;
  /** When the Tokens were credited; non-null means nothing is owed and no reminder is sent. */
  creditedAt: Date | null;
  /** When the one admin reminder went out; non-null means it is never sent again. */
  reminderSentAt: Date | null;
}

const isValid = (d: Date | null): d is Date => d instanceof Date && !Number.isNaN(d.getTime());

/** The latest crediting time: confirmation + 24 h (e.g. confirmed 15 Oct 23:00 → due 16 Oct 23:00). */
export function creditDeadline(paymentConfirmedAt: Date): Date {
  if (!isValid(paymentConfirmedAt)) throw new RangeError("paymentConfirmedAt must be a valid Date");
  return new Date(paymentConfirmedAt.getTime() + CREDIT_DEADLINE_HOURS * HOUR_MS);
}

/** True exactly when the single admin reminder is due: confirmed, uncredited, not yet reminded, ≥ 12 h old. */
export function shouldSendAdminReminder(order: PendingShopierOrder, now: Date): boolean {
  if (!isValid(order.paymentConfirmedAt) || order.creditedAt !== null || order.reminderSentAt !== null) return false;
  return now.getTime() - order.paymentConfirmedAt.getTime() >= ADMIN_REMINDER_AFTER_HOURS * HOUR_MS;
}

/** True once the 24 h commitment has passed for a confirmed, still uncredited order (the deadline instant itself is still on time). */
export function isCreditOverdue(order: PendingShopierOrder, now: Date): boolean {
  if (!isValid(order.paymentConfirmedAt) || order.creditedAt !== null) return false;
  return now.getTime() > creditDeadline(order.paymentConfirmedAt).getTime();
}
