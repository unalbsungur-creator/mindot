/** The 7-day admin session cap (./adminSession). Pure, offline. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ADMIN_SESSION_MAX_AGE_SECONDS, isAdminSessionExpired, isAdminSessionToken, nowInSeconds } from "./adminSession";

const NOW = new Date("2026-11-14T12:00:00Z");
const nowS = nowInSeconds(NOW);

describe("admin session cap", () => {
  it("is 7 days", () => {
    assert.equal(ADMIN_SESSION_MAX_AGE_SECONDS, 604800);
  });

  it("never touches ordinary sessions", () => {
    for (const authProvider of ["google", "apple"]) {
      assert.equal(isAdminSessionToken({ role: "user", authProvider }), false);
      assert.equal(isAdminSessionExpired({ role: "user", authProvider }, NOW), false);
      assert.equal(isAdminSessionExpired({ role: "user", authProvider, adminSignedInAt: 0 }, NOW), false);
    }
  });

  it("keeps an admin session younger than 7 days", () => {
    const token = { role: "admin", authProvider: "credentials", adminSignedInAt: nowS - ADMIN_SESSION_MAX_AGE_SECONDS + 1 };
    assert.equal(isAdminSessionExpired(token, NOW), false);
    assert.equal(isAdminSessionExpired({ ...token, adminSignedInAt: nowS }, NOW), false);
  });

  it("ends an admin session at 7 days, however often it was used", () => {
    const token = { role: "admin", authProvider: "credentials", adminSignedInAt: nowS - ADMIN_SESSION_MAX_AGE_SECONDS };
    assert.equal(isAdminSessionExpired(token, NOW), true);
    assert.equal(isAdminSessionExpired({ ...token, adminSignedInAt: nowS - 30 * 86400 }, NOW), true);
  });

  it("fails closed on a missing, invalid or future start", () => {
    assert.equal(isAdminSessionExpired({ role: "admin", authProvider: "credentials" }, NOW), true);
    assert.equal(isAdminSessionExpired({ authProvider: "credentials", adminSignedInAt: Number.NaN }, NOW), true);
    assert.equal(isAdminSessionExpired({ role: "admin", adminSignedInAt: nowS + 60 }, NOW), true);
  });

  it("treats either signal — Credentials provider or admin role — as an admin session", () => {
    assert.equal(isAdminSessionToken({ authProvider: "credentials" }), true);
    assert.equal(isAdminSessionToken({ role: "admin", authProvider: "google" }), true);
  });
});
