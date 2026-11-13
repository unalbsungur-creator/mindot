import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { createResendEmailService, RESEND_EMAILS_URL } from "./resend";

type Call = { url: string; init: RequestInit };

function stubFetch(response: () => Promise<Response>) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return response();
  }) as typeof fetch;
  return { calls, fetchImpl };
}

const BASE = { to: "admin@example.test", subject: "Konu", html: "<p>x</p>", text: "x" };

describe("Resend provider", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.EMAIL_FROM = "MINDOT <invites@mind-ot.com>";
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it("sends an invitation email exactly as before: EMAIL_FROM, no Reply-To, no idempotency header", async () => {
    const { calls, fetchImpl } = stubFetch(async () => new Response("{}", { status: 200 }));
    assert.deepEqual(await createResendEmailService(fetchImpl).send(BASE), { ok: true });
    assert.equal(calls[0].url, RESEND_EMAILS_URL);
    const headers = calls[0].init.headers as Record<string, string>;
    assert.equal(headers["Idempotency-Key"], undefined);
    assert.deepEqual(JSON.parse(String(calls[0].init.body)), { from: "MINDOT <invites@mind-ot.com>", ...BASE });
    assert.equal(calls[0].init.signal, undefined);
  });

  it("uses a per-email sender, Reply-To and idempotency key when given", async () => {
    const { calls, fetchImpl } = stubFetch(async () => new Response("{}", { status: 200 }));
    await createResendEmailService(fetchImpl).send({
      ...BASE,
      from: "MINDOT Bildirim <bildirim@mind-ot.com>",
      replyTo: "destek@mind-ot.com",
      idempotencyKey: "mindot-modalert:staging:g1:abc:s1",
      timeoutMs: 10_000,
    });
    const headers = calls[0].init.headers as Record<string, string>;
    assert.equal(headers["Idempotency-Key"], "mindot-modalert:staging:g1:abc:s1");
    const body = JSON.parse(String(calls[0].init.body));
    assert.equal(body.from, "MINDOT Bildirim <bildirim@mind-ot.com>");
    assert.equal(body.reply_to, "destek@mind-ot.com");
    assert.ok(calls[0].init.signal instanceof AbortSignal);
  });

  it("always sends both an HTML and a plain-text part, and refuses an email missing either", async () => {
    const { calls, fetchImpl } = stubFetch(async () => new Response("{}", { status: 200 }));
    await createResendEmailService(fetchImpl).send(BASE);
    const body = JSON.parse(String(calls[0].init.body));
    assert.equal(body.html, BASE.html);
    assert.equal(body.text, BASE.text);
    for (const missing of [{ text: "" }, { text: "  " }, { html: "" }]) {
      assert.deepEqual(await createResendEmailService(fetchImpl).send({ ...BASE, ...missing }), { ok: false, reason: "missing-body-part" });
    }
    assert.equal(calls.length, 1, "nothing sent without both parts");
  });

  it("does not need EMAIL_FROM when the email names its own sender", async () => {
    delete process.env.EMAIL_FROM;
    const { fetchImpl } = stubFetch(async () => new Response("{}", { status: 200 }));
    assert.deepEqual(await createResendEmailService(fetchImpl).send({ ...BASE, from: "MINDOT Bildirim <bildirim@mind-ot.com>" }), { ok: true });
    assert.deepEqual(await createResendEmailService(fetchImpl).send(BASE), { ok: false, reason: "not-configured" });
  });

  it("reports a timeout, an HTTP error and a network error as failures without details", async () => {
    const timeout = stubFetch(async () => {
      throw Object.assign(new Error("The operation timed out."), { name: "TimeoutError" });
    });
    assert.deepEqual(await createResendEmailService(timeout.fetchImpl).send({ ...BASE, timeoutMs: 5 }), { ok: false, reason: "resend-timeout" });
    const http = stubFetch(async () => new Response("bad key", { status: 401 }));
    assert.deepEqual(await createResendEmailService(http.fetchImpl).send(BASE), { ok: false, reason: "resend-http-401" });
    const network = stubFetch(async () => {
      throw new TypeError("fetch failed");
    });
    assert.deepEqual(await createResendEmailService(network.fetchImpl).send(BASE), { ok: false, reason: "resend-network-error" });
  });

  it("really aborts a request that outlives its timeout", async () => {
    const fetchImpl = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
      })) as typeof fetch;
    const started = Date.now();
    assert.deepEqual(await createResendEmailService(fetchImpl).send({ ...BASE, timeoutMs: 30 }), { ok: false, reason: "resend-timeout" });
    assert.ok(Date.now() - started < 2000);
  });

  it("is not configured without RESEND_API_KEY", async () => {
    delete process.env.RESEND_API_KEY;
    const { calls, fetchImpl } = stubFetch(async () => new Response("{}", { status: 200 }));
    assert.deepEqual(await createResendEmailService(fetchImpl).send(BASE), { ok: false, reason: "not-configured" });
    assert.equal(calls.length, 0);
  });
});
