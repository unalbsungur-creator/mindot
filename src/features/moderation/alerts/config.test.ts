import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import { ALERT_REPLY_TO, DEFAULT_ALERT_FROM, readModerationAlertConfig, type AlertEnv } from "./config";
import { hashAlertRecipient, isUsableHashKey, MIN_HASH_KEY_BYTES } from "./lib/addressHash";
import { ADDRESS_HASH_PATTERN } from "./types";

const KEY = "k".repeat(MIN_HASH_KEY_BYTES);
const ENABLED: AlertEnv = {
  NODE_ENV: "production",
  MODERATION_ALERTS_ENABLED: "true",
  MODERATION_ALERT_RECIPIENTS: "contact@mind-ot.com, destek@mind-ot.com",
  MODERATION_ALERT_HASH_KEY: KEY,
  EMAIL_PROVIDER: "resend",
  RESEND_API_KEY: "re_test",
};

describe("hashAlertRecipient (HMAC-SHA256)", () => {
  it("is the HMAC-SHA256 of the case-folded address, 64 lowercase hex", async () => {
    const hash = await hashAlertRecipient(KEY, "Destek@Mind-OT.com");
    assert.equal(hash, createHmac("sha256", KEY).update("destek@mind-ot.com").digest("hex"));
    assert.match(hash, ADDRESS_HASH_PATTERN);
    assert.equal(await hashAlertRecipient(KEY, "destek@mind-ot.com"), hash);
  });

  it("depends on the key, so a stored hash can't be matched without it", async () => {
    assert.notEqual(await hashAlertRecipient(KEY, "a@b.co"), await hashAlertRecipient("x".repeat(32), "a@b.co"));
  });

  it("refuses a key shorter than 32 bytes", async () => {
    assert.equal(isUsableHashKey("short"), false);
    assert.equal(isUsableHashKey(undefined), false);
    await assert.rejects(hashAlertRecipient("short", "a@b.co"), RangeError);
  });
});

describe("readModerationAlertConfig", () => {
  it("is off by default — nothing set, or anything but exactly \"true\"", async () => {
    for (const flag of [undefined, "", "1", "yes", "TRUE", "false"]) {
      const runtime = await readModerationAlertConfig({ ...ENABLED, MODERATION_ALERTS_ENABLED: flag });
      assert.deepEqual(runtime.state, { status: "disabled", reason: "flag-off" }, String(flag));
      assert.equal(runtime.addresses.size, 0);
    }
  });

  it("fails closed on each missing or invalid piece", async () => {
    const cases: Array<[AlertEnv, string]> = [
      [{ ...ENABLED, MODERATION_ALERT_RECIPIENTS: undefined }, "no-recipients"],
      [{ ...ENABLED, MODERATION_ALERT_RECIPIENTS: "not-an-address" }, "invalid-recipient"],
      [{ ...ENABLED, MODERATION_ALERT_RECIPIENTS: "a@b.co,\r\nBcc: x@y.co" }, "invalid-recipient"],
      [{ ...ENABLED, MODERATION_ALERT_RECIPIENTS: "a@b.co,b@b.co,c@b.co,d@b.co,e@b.co,f@b.co" }, "too-many-recipients"],
      [{ ...ENABLED, MODERATION_ALERT_HASH_KEY: undefined }, "hash-key-missing"],
      [{ ...ENABLED, MODERATION_ALERT_HASH_KEY: "too-short" }, "hash-key-missing"],
      [{ ...ENABLED, EMAIL_PROVIDER: undefined }, "provider-not-configured"],
      [{ ...ENABLED, RESEND_API_KEY: "" }, "provider-not-configured"],
      [{ ...ENABLED, MODERATION_ALERT_FROM: "Evil\r\nBcc: x@y.co <a@b.co>" }, "provider-not-configured"],
    ];
    for (const [env, reason] of cases) {
      const runtime = await readModerationAlertConfig(env);
      assert.deepEqual(runtime.state, { status: "disabled", reason }, reason);
      assert.equal(runtime.addresses.size, 0, reason);
    }
  });

  it("enables with hashed recipients only; the addresses stay in memory for delivery", async () => {
    const runtime = await readModerationAlertConfig(ENABLED);
    assert.equal(runtime.state.status, "enabled");
    if (runtime.state.status !== "enabled") return;
    assert.equal(runtime.state.environment, "production");
    assert.equal(runtime.state.recipients.length, 2);
    for (const hash of runtime.state.recipients) assert.match(hash, ADDRESS_HASH_PATTERN);
    assert.ok(!JSON.stringify(runtime.state).includes("@"), "the decision input never holds an address");
    assert.deepEqual([...runtime.addresses.values()].sort(), ["contact@mind-ot.com", "destek@mind-ot.com"]);
    assert.equal(runtime.from, DEFAULT_ALERT_FROM);
    assert.equal(runtime.from, "MINDOT Bildirim <bildirim@mind-ot.com>");
    assert.equal(runtime.replyTo, ALERT_REPLY_TO);
    assert.equal(runtime.adminModerationUrl, "https://mind-ot.com/admin/moderation");
  });

  it("uses MODERATION_ALERT_FROM when set, and never EMAIL_FROM", async () => {
    const custom = await readModerationAlertConfig({ ...ENABLED, MODERATION_ALERT_FROM: "Moderasyon <mod@mind-ot.com>", EMAIL_FROM: "MINDOT <invites@mind-ot.com>" });
    assert.equal(custom.from, "Moderasyon <mod@mind-ot.com>");
    const fallback = await readModerationAlertConfig({ ...ENABLED, EMAIL_FROM: "MINDOT <invites@mind-ot.com>" });
    assert.equal(fallback.from, DEFAULT_ALERT_FROM);
  });

  it("points staging at the staging admin page", async () => {
    const runtime = await readModerationAlertConfig({
      ...ENABLED,
      NODE_ENV: "production",
      APP_ENV: "staging",
      AUTH_URL: "https://staging.mind-ot.com",
      MODERATION_ALERT_RECIPIENTS: "destek@mind-ot.com",
    });
    assert.equal(runtime.environment, "staging");
    assert.equal(runtime.adminModerationUrl, "https://staging.mind-ot.com/admin/moderation");
    assert.equal(runtime.state.status === "enabled" && runtime.state.recipients.length, 1);
  });

  it("never puts a configured value in a disabled result", async () => {
    const runtime = await readModerationAlertConfig({ ...ENABLED, MODERATION_ALERT_RECIPIENTS: "secret@example.com,not valid" });
    assert.ok(!JSON.stringify({ ...runtime, addresses: [...runtime.addresses] }).includes("secret@example.com"));
  });
});
