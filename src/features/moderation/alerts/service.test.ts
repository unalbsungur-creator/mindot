import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { EmailService, SendEmailInput } from "@/features/email/types";
import { readModerationAlertConfig, type ModerationAlertRuntime } from "./config";
import { MIN_HASH_KEY_BYTES } from "./lib/addressHash";
import type { AlertClaim, AlertEvaluation, ClaimedSend } from "./repository";
import { runModerationAlerts } from "./service";
import { SEND_TIMEOUT_MS } from "./types";

async function runtime(): Promise<ModerationAlertRuntime> {
  return readModerationAlertConfig({
    NODE_ENV: "production",
    APP_ENV: "staging",
    AUTH_URL: "https://staging.mind-ot.com",
    MODERATION_ALERTS_ENABLED: "true",
    MODERATION_ALERT_RECIPIENTS: "destek@mind-ot.com",
    MODERATION_ALERT_HASH_KEY: "k".repeat(MIN_HASH_KEY_BYTES),
    EMAIL_PROVIDER: "resend",
    RESEND_API_KEY: "re_test",
  });
}

function recordingEmail(result: { ok: boolean } = { ok: true }) {
  const sent: SendEmailInput[] = [];
  const email: EmailService = {
    async send(input) {
      sent.push(input);
      return result.ok ? { ok: true } : { ok: false, reason: "resend-http-500" };
    },
  };
  return { sent, email };
}

function claimFor(config: ModerationAlertRuntime, overrides: Partial<ClaimedSend> = {}): AlertClaim {
  const hash = config.state.status === "enabled" ? config.state.recipients[0] : "";
  return {
    generation: 1,
    leaseToken: "t".repeat(48),
    leaseExpiresAt: new Date(Date.now() + 60_000),
    sends: [{ addressHash: hash, kind: "initial", templateKind: "initial", sendSequence: 1, idempotencyKey: "mindot-modalert:staging:g1:x:s1", claimedCount: 3, ...overrides }],
  };
}

/** One claim, then idle. */
function sequence(claim: AlertClaim): () => Promise<AlertEvaluation> {
  let calls = 0;
  return async () =>
    calls++ === 0
      ? { status: "claimed", claim, pendingReviewCount: 3 }
      : { status: "idle", reason: "nothing-due", nextDueAt: new Date("2026-11-09T12:30:00Z"), pendingReviewCount: 3 };
}

describe("runModerationAlerts", () => {
  it("emails the claimed count and the admin link — from the alert sender, with Reply-To, idempotency key and timeout", async () => {
    const config = await runtime();
    const { sent, email } = recordingEmail();
    const completions: boolean[] = [];
    const claim = claimFor(config);
    const summary = await runModerationAlerts({
      config,
      email,
      evaluate: sequence(claim),
      complete: async (_claim, _send, delivered) => (completions.push(delivered), true),
      release: async () => true,
    });
    assert.equal(summary.status, "sent");
    assert.deepEqual([summary.attempted, summary.delivered, summary.failed, summary.stale], [1, 1, 0, 0]);
    assert.deepEqual(summary.nextDueAt, new Date("2026-11-09T12:30:00Z"));
    assert.deepEqual(completions, [true]);
    const [message] = sent;
    assert.equal(message.to, "destek@mind-ot.com");
    assert.equal(message.from, "MINDOT Bildirim <bildirim@mind-ot.com>");
    assert.equal(message.replyTo, "destek@mind-ot.com");
    assert.equal(message.idempotencyKey, claim.sends[0].idempotencyKey);
    assert.equal(message.timeoutMs, SEND_TIMEOUT_MS);
    assert.equal(message.subject, "[STAGING] [MINDOT] Moderasyon: 3 içerik onay bekliyor");
    assert.ok(message.text.includes("https://staging.mind-ot.com/admin/moderation"));
  });

  it("sends a retry with the claimed count and key, not the current queue", async () => {
    const config = await runtime();
    const { sent, email } = recordingEmail();
    const claim = claimFor(config, { kind: "retry", claimedCount: 7, idempotencyKey: "mindot-modalert:staging:g1:x:s2", sendSequence: 2, templateKind: "reminder" });
    await runModerationAlerts({ config, email, evaluate: sequence(claim), complete: async () => true, release: async () => true });
    assert.ok(sent[0].subject.includes("7 içerik"));
    assert.equal(sent[0].idempotencyKey, "mindot-modalert:staging:g1:x:s2");
  });

  it("records a failed delivery as a failure and counts a stale completion", async () => {
    const config = await runtime();
    const { email } = recordingEmail({ ok: false });
    const completions: boolean[] = [];
    const summary = await runModerationAlerts({
      config,
      email,
      evaluate: sequence(claimFor(config)),
      complete: async (_c, _s, delivered) => (completions.push(delivered), false),
      release: async () => true,
    });
    assert.deepEqual(completions, [false]);
    assert.deepEqual([summary.failed, summary.stale], [1, 1]);
  });

  it("never throws — a database or provider error becomes status \"error\"", async () => {
    const config = await runtime();
    const failing = await runModerationAlerts({ config, evaluate: async () => Promise.reject(new Error("connection refused")) });
    assert.equal(failing.status, "error");
    const throwingEmail: EmailService = { send: async () => Promise.reject(new Error("boom")) };
    const summary = await runModerationAlerts({ config, email: throwingEmail, evaluate: sequence(claimFor(config)), complete: async () => true, release: async () => true });
    assert.deepEqual([summary.status, summary.failed], ["sent", 1]);
  });

  it("sends nothing while alerts are disabled", async () => {
    const config = await readModerationAlertConfig({ NODE_ENV: "production" });
    const { sent, email } = recordingEmail();
    const summary = await runModerationAlerts({
      config,
      email,
      evaluate: async () => ({ status: "idle", reason: "alerts-disabled", nextDueAt: null, pendingReviewCount: 4 }),
    });
    assert.equal(summary.status, "disabled");
    assert.equal(sent.length, 0);
  });

  it("never logs an address", async () => {
    const config = await runtime();
    const { email } = recordingEmail();
    const logged: string[] = [];
    const original = { info: console.info, error: console.error };
    console.info = (...args: unknown[]) => void logged.push(args.join(" "));
    console.error = (...args: unknown[]) => void logged.push(args.join(" "));
    try {
      await runModerationAlerts({ config, email, evaluate: sequence(claimFor(config)), complete: async () => true, release: async () => true });
    } finally {
      Object.assign(console, original);
    }
    assert.ok(logged.length > 0);
    assert.ok(logged.every((line) => !line.includes("@") && !/[0-9a-f]{64}/.test(line)), logged.join("\n"));
  });
});
