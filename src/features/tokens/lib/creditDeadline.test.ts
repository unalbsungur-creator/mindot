import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ADMIN_REMINDER_AFTER_HOURS,
  CREDIT_DEADLINE_HOURS,
  creditDeadline,
  isCreditOverdue,
  shouldSendAdminReminder,
  type PendingShopierOrder,
} from "./creditDeadline";

const HOUR = 60 * 60 * 1000;
// 15 Oct 2026 23:00 in Türkiye (UTC+3) — the decision's own example.
const CONFIRMED = new Date("2026-10-15T20:00:00Z");
const at = (hours: number) => new Date(CONFIRMED.getTime() + hours * HOUR);
const order = (overrides: Partial<PendingShopierOrder> = {}): PendingShopierOrder => ({
  paymentConfirmedAt: CONFIRMED,
  creditedAt: null,
  reminderSentAt: null,
  ...overrides,
});

describe("Shopier crediting commitment", () => {
  it("is 24 continuous hours, reminder at 12", () => {
    assert.equal(CREDIT_DEADLINE_HOURS, 24);
    assert.equal(ADMIN_REMINDER_AFTER_HOURS, 12);
  });

  it("puts the deadline exactly 24 hours after confirmation (15 Oct 23:00 → 16 Oct 23:00, Türkiye time)", () => {
    assert.equal(creditDeadline(CONFIRMED).toISOString(), "2026-10-16T20:00:00.000Z");
  });

  it("counts calendar hours, not business days (a Saturday confirmation is due on Sunday)", () => {
    const saturday = new Date("2026-10-17T09:00:00Z");
    assert.equal(creditDeadline(saturday).toISOString(), "2026-10-18T09:00:00.000Z");
  });

  it("refuses an invalid confirmation time", () => {
    assert.throws(() => creditDeadline(new Date("not a date")), RangeError);
  });

  it("sends no reminder before 12 hours", () => {
    assert.equal(shouldSendAdminReminder(order(), at(0)), false);
    assert.equal(shouldSendAdminReminder(order(), new Date(at(12).getTime() - 1)), false);
  });

  it("sends the reminder at exactly 12 hours, and after", () => {
    assert.equal(shouldSendAdminReminder(order(), at(12)), true);
    assert.equal(shouldSendAdminReminder(order(), at(20)), true);
  });

  it("never reminds about an order whose Tokens are already credited", () => {
    assert.equal(shouldSendAdminReminder(order({ creditedAt: at(3) }), at(12)), false);
    assert.equal(shouldSendAdminReminder(order({ creditedAt: at(13) }), at(30)), false);
  });

  it("sends the reminder only once", () => {
    assert.equal(shouldSendAdminReminder(order({ reminderSentAt: at(12) }), at(12)), false);
    assert.equal(shouldSendAdminReminder(order({ reminderSentAt: at(12) }), at(23)), false);
  });

  it("starts no clock while the payment isn't confirmed", () => {
    const unconfirmed = order({ paymentConfirmedAt: null });
    assert.equal(shouldSendAdminReminder(unconfirmed, at(100)), false);
    assert.equal(isCreditOverdue(unconfirmed, at(100)), false);
  });

  it("is on time up to and including the 24-hour mark, overdue after it", () => {
    assert.equal(isCreditOverdue(order(), at(24)), false);
    assert.equal(isCreditOverdue(order(), new Date(at(24).getTime() + 1)), true);
  });

  it("is never overdue once credited, even late", () => {
    assert.equal(isCreditOverdue(order({ creditedAt: at(30) }), at(40)), false);
  });
});
