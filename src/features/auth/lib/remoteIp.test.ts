/**
 * GÖREV 44 — Test Group 3: the trusted client-IP selection (pickTrustedRemoteIp
 * in ./remoteIp). The admin Turnstile check forwards this value to siteverify
 * as `remoteip`, so it must come ONLY from Cloudflare's own CF-Connecting-IP
 * header and never from a client-forgeable forwarding header.
 *
 * Pure and offline: the helper takes an already-resolved Headers object, so
 * these tests construct one directly — no next/headers, no NextAuth, no
 * request scope, no network. All IPs below are RFC 5737 documentation
 * addresses, not real endpoints.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pickTrustedRemoteIp } from "./remoteIp";

describe("pickTrustedRemoteIp", () => {
  it("C7: returns the Cloudflare CF-Connecting-IP value when present", () => {
    const headers = new Headers({ "CF-Connecting-IP": "203.0.113.10" });
    assert.equal(pickTrustedRemoteIp(headers), "203.0.113.10");
  });

  it("C8: selects only CF-Connecting-IP, never the forgeable forwarding headers", () => {
    const headers = new Headers({
      "CF-Connecting-IP": "203.0.113.10",
      "X-Forwarded-For": "198.51.100.20",
      "X-Real-IP": "198.51.100.30",
    });
    assert.equal(pickTrustedRemoteIp(headers), "203.0.113.10");

    // And X-Forwarded-For / X-Real-IP alone are never accepted as a substitute.
    const spoofedOnly = new Headers({
      "X-Forwarded-For": "198.51.100.20",
      "X-Real-IP": "198.51.100.30",
    });
    assert.equal(pickTrustedRemoteIp(spoofedOnly), null);
  });

  it("C9: returns null when the trusted header is absent", () => {
    assert.equal(pickTrustedRemoteIp(new Headers()), null);
    // The null remoteIp path still enforces every token check — see
    // turnstile.test.ts ("forwards ... the remote IP only when provided"),
    // which asserts verification runs identically with remoteIp null.
  });
});
