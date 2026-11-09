import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_ALERT_PENDING_COUNT,
  escapeHtml,
  moderationAlertEmailContent,
  type ModerationAlertEmailInput,
} from "./alertEmailTemplate";

const PROD_URL = "https://mind-ot.com/admin/moderation";
const STAGING_URL = "https://staging.mind-ot.com/admin/moderation";
const DEV_URL = "http://localhost:3200/admin/moderation";

function base(overrides: Partial<ModerationAlertEmailInput> = {}): ModerationAlertEmailInput {
  return { kind: "initial", pendingReviewCount: 3, adminModerationUrl: PROD_URL, environment: "production", ...overrides };
}

function content(overrides: Partial<ModerationAlertEmailInput> = {}) {
  const result = moderationAlertEmailContent(base(overrides));
  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok) throw new Error("unreachable");
  return result.content;
}

describe("moderationAlertEmailContent — production", () => {
  it("has no environment prefix, shows the count and links to /admin/moderation", () => {
    const { subject, html, text } = content();
    assert.equal(subject, "[MINDOT] Moderasyon: 3 içerik onay bekliyor");
    assert.ok(subject.startsWith("[MINDOT] Moderasyon:"));
    assert.ok(html.includes(`href="${PROD_URL}"`));
    assert.ok(text.includes(PROD_URL));
    assert.ok(text.includes("Şu anda inceleme bekleyen içerik sayısı: 3."));
    assert.ok(html.includes("Şu anda inceleme bekleyen içerik sayısı: 3."));
    for (const part of [subject, html, text]) {
      assert.ok(!part.includes("[STAGING]") && !part.includes("[DEV]"));
    }
  });

  it("uses different wording for a reminder", () => {
    const initial = content();
    const reminder = content({ kind: "reminder", pendingReviewCount: 12 });
    assert.equal(reminder.subject, "[MINDOT] Moderasyon: hatırlatma — 12 içerik hâlâ onay bekliyor");
    assert.notEqual(reminder.subject, initial.subject);
    assert.ok(reminder.text.startsWith("Moderasyon kuyruğunda hâlâ"));
    assert.ok(initial.text.startsWith("Moderasyon kuyruğuna inceleme bekleyen yeni"));
  });

  it("accepts the largest allowed count", () => {
    assert.ok(content({ pendingReviewCount: MAX_ALERT_PENDING_COUNT }).subject.includes(String(MAX_ALERT_PENDING_COUNT)));
  });
});

describe("moderationAlertEmailContent — environment labelling", () => {
  it("prefixes staging with [STAGING] in the subject and labels the body", () => {
    const { subject, html, text } = content({ environment: "staging", adminModerationUrl: STAGING_URL });
    assert.ok(subject.startsWith("[STAGING] [MINDOT] Moderasyon:"));
    assert.ok(text.startsWith("[STAGING] STAGING ortamı"));
    assert.ok(html.includes("[STAGING] STAGING ortamı"));
    assert.ok(html.includes(`href="${STAGING_URL}"`));
  });

  it("prefixes development with [DEV] and accepts a loopback URL", () => {
    const { subject, text } = content({ environment: "development", adminModerationUrl: DEV_URL, kind: "reminder" });
    assert.ok(subject.startsWith("[DEV] [MINDOT] Moderasyon: hatırlatma"));
    assert.ok(text.startsWith("[DEV] DEV ortamı"));
    assert.ok(text.includes(DEV_URL));
  });

  it("accepts every loopback host form in development", () => {
    for (const url of ["http://127.0.0.1:3200/admin/moderation", "http://[::1]:3200/admin/moderation", "https://localhost/admin/moderation"]) {
      assert.ok(content({ environment: "development", adminModerationUrl: url }).text.includes(url), url);
    }
  });
});

describe("moderationAlertEmailContent — privacy", () => {
  it("contains nothing beyond its four inputs, even when extra fields are smuggled in", () => {
    const smuggled = {
      ...base(),
      content: "SECRET-CARD-TEXT",
      authorName: "Jane Writer",
      authorEmail: "jane@example.com",
      messageId: "msg_123456",
      token: "tok_abcdef",
      recipient: "admin@example.com",
    } as ModerationAlertEmailInput;
    const result = moderationAlertEmailContent(smuggled);
    assert.ok(result.ok);
    const all = JSON.stringify(result);
    for (const leaked of ["SECRET-CARD-TEXT", "Jane", "jane@", "msg_123456", "tok_abcdef", "admin@example.com"]) {
      assert.ok(!all.includes(leaked), leaked);
    }
  });

  it("never contains an e-mail address", () => {
    for (const environment of ["production", "staging", "development"] as const) {
      const url = { production: PROD_URL, staging: STAGING_URL, development: DEV_URL }[environment];
      for (const kind of ["initial", "reminder"] as const) {
        const { subject, html, text } = content({ environment, adminModerationUrl: url, kind });
        for (const part of [subject, html, text]) assert.ok(!part.includes("@"), `${environment}/${kind}`);
      }
    }
  });

  it("escapes HTML special characters", () => {
    assert.equal(escapeHtml(`<script>"x" & 'y'</script>`), "&lt;script&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/script&gt;");
  });

  it("produces no script or event-handler markup", () => {
    const { html } = content();
    assert.ok(!/<script/i.test(html));
    assert.ok(!/\son\w+=/i.test(html));
    assert.ok(!html.includes("javascript:"));
  });
});

describe("moderationAlertEmailContent — fail closed", () => {
  for (const pendingReviewCount of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, MAX_ALERT_PENDING_COUNT + 1, "3" as unknown as number]) {
    it(`rejects the count ${String(pendingReviewCount)}`, () => {
      assert.deepEqual(moderationAlertEmailContent(base({ pendingReviewCount })), { ok: false, reason: "invalid-count" });
    });
  }

  it("rejects an unknown kind or environment", () => {
    assert.deepEqual(moderationAlertEmailContent(base({ kind: "digest" as "initial" })), { ok: false, reason: "invalid-kind" });
    assert.deepEqual(moderationAlertEmailContent(base({ environment: "prod" as "production" })), {
      ok: false,
      reason: "invalid-environment",
    });
  });

  const unsafe: [string, Partial<ModerationAlertEmailInput>][] = [
    ["javascript: URL", { adminModerationUrl: "javascript:alert(1)//admin/moderation" }],
    ["data: URL", { adminModerationUrl: "data:text/html,<a>/admin/moderation</a>" }],
    ["foreign host in production", { adminModerationUrl: "https://evil.example/admin/moderation" }],
    ["look-alike host", { adminModerationUrl: "https://mind-ot.com.evil.example/admin/moderation" }],
    ["plain http in production", { adminModerationUrl: "http://mind-ot.com/admin/moderation" }],
    ["non-default port in production", { adminModerationUrl: "https://mind-ot.com:8443/admin/moderation" }],
    ["staging URL in production", { adminModerationUrl: STAGING_URL }],
    ["production URL in staging", { environment: "staging", adminModerationUrl: PROD_URL }],
    ["production URL in development", { environment: "development", adminModerationUrl: PROD_URL }],
    ["non-loopback development host", { environment: "development", adminModerationUrl: "http://192.168.1.20:3200/admin/moderation" }],
    ["credentials in URL", { adminModerationUrl: "https://user:pass@mind-ot.com/admin/moderation" }],
    ["query string", { adminModerationUrl: `${PROD_URL}?message=msg_123` }],
    ["empty query marker", { adminModerationUrl: `${PROD_URL}?` }],
    ["fragment", { adminModerationUrl: `${PROD_URL}#msg_123` }],
    ["other path", { adminModerationUrl: "https://mind-ot.com/admin" }],
    ["trailing slash", { adminModerationUrl: `${PROD_URL}/` }],
    ["deeper path", { adminModerationUrl: `${PROD_URL}/msg_123` }],
    ["encoded path", { adminModerationUrl: "https://mind-ot.com/admin/%6Doderation" }],
    ["dot segments", { adminModerationUrl: "https://mind-ot.com/x/../admin/moderation" }],
    ["explicit default port (non-canonical)", { adminModerationUrl: "https://mind-ot.com:443/admin/moderation" }],
    ["upper-case host (non-canonical)", { adminModerationUrl: "https://MIND-OT.com/admin/moderation" }],
    ["backslash", { adminModerationUrl: "https:\\\\mind-ot.com\\admin\\moderation" }],
    ["embedded whitespace", { adminModerationUrl: " https://mind-ot.com/admin/moderation" }],
    ["embedded newline", { adminModerationUrl: "https://mind-ot.com/admin/moderation\n" }],
    ["HTML in URL", { adminModerationUrl: 'https://mind-ot.com/admin/moderation"><script>' }],
    ["relative URL", { adminModerationUrl: "/admin/moderation" }],
    ["empty URL", { adminModerationUrl: "" }],
    ["non-string URL", { adminModerationUrl: null as unknown as string }],
  ];
  for (const [name, overrides] of unsafe) {
    it(`rejects an unsafe URL: ${name}`, () => {
      assert.deepEqual(moderationAlertEmailContent(base(overrides)), { ok: false, reason: "unsafe-url" });
    });
  }
});
