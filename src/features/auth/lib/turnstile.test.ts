import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_TURNSTILE_TOKEN_LENGTH,
  TURNSTILE_ADMIN_LOGIN_ACTION,
  TURNSTILE_SITEVERIFY_URL,
  verifyTurnstileToken,
  type TurnstileVerifyOptions,
} from "./turnstile";

const ALLOWED = ["staging.mind-ot.com"] as const;

/** A fake `fetch` that records its calls and returns a scripted siteverify body. */
function fakeFetch(
  body: unknown,
  { ok = true, throwError = false, jsonThrows = false }: { ok?: boolean; throwError?: boolean; jsonThrows?: boolean } = {}
) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const impl = (async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    if (throwError) throw new Error("network down");
    return {
      ok,
      async json() {
        if (jsonThrows) throw new SyntaxError("not json");
        return body;
      },
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

function options(overrides: Partial<TurnstileVerifyOptions> = {}): TurnstileVerifyOptions {
  return {
    secret: "secret-key",
    allowedHostnames: ALLOWED,
    expectedAction: TURNSTILE_ADMIN_LOGIN_ACTION,
    ...overrides,
  };
}

describe("verifyTurnstileToken", () => {
  it("accepts a successful token with the expected action and hostname", async () => {
    const { impl, calls } = fakeFetch({ success: true, action: "admin-login", hostname: "staging.mind-ot.com" });
    const result = await verifyTurnstileToken("tok", options({ fetchImpl: impl }));
    assert.deepEqual(result, { ok: true });
    assert.equal(calls.length, 1, "siteverify is called exactly once (no retry)");
    assert.equal(calls[0].url, TURNSTILE_SITEVERIFY_URL);
  });

  it("rejects a missing token before any network call", async () => {
    const { impl, calls } = fakeFetch({ success: true, action: "admin-login", hostname: "staging.mind-ot.com" });
    assert.deepEqual(await verifyTurnstileToken("", options({ fetchImpl: impl })), { ok: false, reason: "no-token" });
    assert.equal(calls.length, 0);
  });

  it("rejects an oversized token before any network call", async () => {
    const { impl, calls } = fakeFetch({ success: true });
    const huge = "a".repeat(MAX_TURNSTILE_TOKEN_LENGTH + 1);
    assert.deepEqual(await verifyTurnstileToken(huge, options({ fetchImpl: impl })), { ok: false, reason: "token-too-long" });
    assert.equal(calls.length, 0);
  });

  it("fails closed when the secret is missing, before any network call", async () => {
    const { impl, calls } = fakeFetch({ success: true });
    assert.deepEqual(await verifyTurnstileToken("tok", options({ secret: undefined, fetchImpl: impl })), {
      ok: false,
      reason: "secret-missing",
    });
    assert.equal(calls.length, 0);
  });

  it("rejects an invalid / expired / reused token (success:false)", async () => {
    // Cloudflare returns success:false with error-codes like
    // "invalid-input-response" (invalid) or "timeout-or-duplicate" (expired/reused).
    for (const codes of [["invalid-input-response"], ["timeout-or-duplicate"]]) {
      const { impl } = fakeFetch({ success: false, "error-codes": codes });
      assert.deepEqual(await verifyTurnstileToken("tok", options({ fetchImpl: impl })), { ok: false, reason: "unsuccessful" });
    }
  });

  it("rejects an action mismatch", async () => {
    const { impl } = fakeFetch({ success: true, action: "something-else", hostname: "staging.mind-ot.com" });
    assert.deepEqual(await verifyTurnstileToken("tok", options({ fetchImpl: impl })), { ok: false, reason: "action-mismatch" });
  });

  it("rejects a hostname not on the allow-list", async () => {
    const { impl } = fakeFetch({ success: true, action: "admin-login", hostname: "mind-ot.com" });
    assert.deepEqual(await verifyTurnstileToken("tok", options({ fetchImpl: impl })), { ok: false, reason: "hostname-mismatch" });
  });

  it("fails closed on an HTTP error (5xx)", async () => {
    const { impl } = fakeFetch({}, { ok: false });
    assert.deepEqual(await verifyTurnstileToken("tok", options({ fetchImpl: impl })), { ok: false, reason: "http-error" });
  });

  it("fails closed on a network error with no retry", async () => {
    const { impl, calls } = fakeFetch({}, { throwError: true });
    assert.deepEqual(await verifyTurnstileToken("tok", options({ fetchImpl: impl })), { ok: false, reason: "request-failed" });
    assert.equal(calls.length, 1, "no retry after a network failure");
  });

  it("fails closed on a malformed (non-JSON) response", async () => {
    const { impl } = fakeFetch(null, { jsonThrows: true });
    assert.deepEqual(await verifyTurnstileToken("tok", options({ fetchImpl: impl })), { ok: false, reason: "malformed-response" });
  });

  it("forwards secret and response, and the remote IP only when provided", async () => {
    const withIp = fakeFetch({ success: true, action: "admin-login", hostname: "staging.mind-ot.com" });
    await verifyTurnstileToken("tok", options({ fetchImpl: withIp.impl, remoteIp: "203.0.113.7" }));
    const body = withIp.calls[0].init?.body as URLSearchParams;
    assert.equal(body.get("secret"), "secret-key");
    assert.equal(body.get("response"), "tok");
    assert.equal(body.get("remoteip"), "203.0.113.7");

    const noIp = fakeFetch({ success: true, action: "admin-login", hostname: "staging.mind-ot.com" });
    await verifyTurnstileToken("tok", options({ fetchImpl: noIp.impl, remoteIp: null }));
    assert.equal((noIp.calls[0].init?.body as URLSearchParams).has("remoteip"), false);
  });
});
