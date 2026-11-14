/** Signed-out report limits (./anonymousReportLimits): the address hash and the KV keys. Pure, offline. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cardKey, hashReporterAddress, hourBucket, hourKey, REPORT_LIMIT_KEY_PREFIX } from "./anonymousReportLimits";

describe("signed-out report limits", () => {
  it("hashes an address with the server secret: stable, secret-dependent, never the address itself", async () => {
    const a = await hashReporterAddress("203.0.113.7", "secret-one");
    assert.equal(a, await hashReporterAddress(" 203.0.113.7 ", "secret-one"));
    assert.notEqual(a, await hashReporterAddress("203.0.113.7", "secret-two"));
    assert.notEqual(a, await hashReporterAddress("203.0.113.8", "secret-one"));
    assert.match(a, /^[0-9a-f]{32}$/);
    assert.ok(!a.includes("203"));
    // IPv6 is case-insensitive.
    assert.equal(await hashReporterAddress("2001:DB8::1", "s"), await hashReporterAddress("2001:db8::1", "s"));
  });

  it("keeps every key under its own prefix, with no address in it", async () => {
    const hash = await hashReporterAddress("198.51.100.1", "s");
    const now = new Date("2026-11-14T12:59:59Z");
    for (const key of [hourKey(hash, now), cardKey(hash, "msg-1")]) {
      assert.ok(key.startsWith(REPORT_LIMIT_KEY_PREFIX));
      assert.ok(!key.includes("198.51.100.1"));
    }
    assert.notEqual(hourKey(hash, now), hourKey(hash, new Date("2026-11-14T13:00:00Z")));
    assert.equal(hourBucket(new Date("2026-11-14T12:00:00Z")), hourBucket(now));
  });
});
