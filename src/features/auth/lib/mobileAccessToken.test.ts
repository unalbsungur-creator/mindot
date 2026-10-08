import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SignJWT } from "jose";
import {
  issueMobileAccessToken,
  MOBILE_ACCESS_TOKEN_CLOCK_TOLERANCE_SECONDS,
  verifyMobileAccessToken,
  type MobileAccessTokenConfig,
} from "./mobileAccessToken";

const CONFIG: MobileAccessTokenConfig = {
  secret: "test-secret-that-is-at-least-32-bytes-long!!",
  issuer: "https://staging.mind-ot.com",
  audience: "mindot-mobile-api",
  ttlSeconds: 15 * 60,
};
const SUBJECT = { sub: "google-sub-1", sid: "550e8400-e29b-41d4-a716-446655440000", authProvider: "google" as const };
const NOW = new Date("2026-10-08T12:00:00.000Z");
const NOW_S = Math.floor(NOW.getTime() / 1000);

function at(secondsFromNow: number): Date {
  return new Date(NOW.getTime() + secondsFromNow * 1000);
}

function b64url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

/** Signs arbitrary claims with the test secret, bypassing issueMobileAccessToken's own shape. */
function sign(claims: Record<string, unknown>, options: { alg?: string; secret?: string } = {}) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: options.alg ?? "HS256" })
    .sign(new TextEncoder().encode(options.secret ?? CONFIG.secret));
}

const VALID_CLAIMS = {
  sub: SUBJECT.sub,
  sid: SUBJECT.sid,
  role: "user",
  authProvider: "google",
  iss: CONFIG.issuer,
  aud: CONFIG.audience,
  iat: NOW_S,
  exp: NOW_S + CONFIG.ttlSeconds,
};

describe("mobile access token", () => {
  it("issues a token that verifies with the same config", async () => {
    const { token, expiresAt } = await issueMobileAccessToken(SUBJECT, CONFIG, NOW);
    assert.equal(expiresAt.getTime(), NOW.getTime() + CONFIG.ttlSeconds * 1000);
    assert.ok(await verifyMobileAccessToken(token, CONFIG, NOW));
  });

  it("returns the claims it was issued with", async () => {
    const { token } = await issueMobileAccessToken({ ...SUBJECT, authProvider: "apple" }, CONFIG, NOW);
    assert.deepEqual(await verifyMobileAccessToken(token, CONFIG, NOW), {
      sub: SUBJECT.sub,
      sid: SUBJECT.sid,
      role: "user",
      authProvider: "apple",
      iat: NOW_S,
      exp: NOW_S + CONFIG.ttlSeconds,
    });
  });

  it("puts exactly the expected claims in the payload, with role always user", async () => {
    const { token } = await issueMobileAccessToken(SUBJECT, CONFIG, NOW);
    const [header, payload] = token.split(".").slice(0, 2).map((part) => JSON.parse(Buffer.from(part, "base64url").toString()));
    assert.deepEqual(header, { alg: "HS256", typ: "JWT" });
    assert.deepEqual(Object.keys(payload).sort(), ["aud", "authProvider", "exp", "iat", "iss", "role", "sid", "sub"]);
    assert.equal(payload.role, "user");
  });

  it("refuses to issue for an unknown provider or empty ids", async () => {
    await assert.rejects(issueMobileAccessToken({ ...SUBJECT, authProvider: "credentials" as "google" }, CONFIG, NOW));
    await assert.rejects(issueMobileAccessToken({ ...SUBJECT, sub: "" }, CONFIG, NOW));
    await assert.rejects(issueMobileAccessToken({ ...SUBJECT, sid: "" }, CONFIG, NOW));
  });

  it("fails closed on a secret shorter than 32 bytes", async () => {
    const short = { ...CONFIG, secret: "x".repeat(31) };
    await assert.rejects(issueMobileAccessToken(SUBJECT, short, NOW));
    const { token } = await issueMobileAccessToken(SUBJECT, CONFIG, NOW);
    await assert.rejects(verifyMobileAccessToken(token, short, NOW));
  });

  it("rejects a token signed with another secret", async () => {
    const { token } = await issueMobileAccessToken(SUBJECT, { ...CONFIG, secret: "another-secret-that-is-also-32-bytes-long" }, NOW);
    assert.equal(await verifyMobileAccessToken(token, CONFIG, NOW), null);
  });

  it("rejects an unsigned alg none token", async () => {
    const token = `${b64url({ alg: "none", typ: "JWT" })}.${b64url(VALID_CLAIMS)}.`;
    assert.equal(await verifyMobileAccessToken(token, CONFIG, NOW), null);
  });

  it("rejects any algorithm other than HS256", async () => {
    for (const alg of ["HS384", "HS512"]) {
      assert.equal(await verifyMobileAccessToken(await sign(VALID_CLAIMS, { alg }), CONFIG, NOW), null, alg);
    }
  });

  it("rejects a wrong issuer", async () => {
    const { token } = await issueMobileAccessToken(SUBJECT, { ...CONFIG, issuer: "https://mind-ot.com" }, NOW);
    assert.equal(await verifyMobileAccessToken(token, CONFIG, NOW), null);
  });

  it("rejects a wrong audience", async () => {
    const { token } = await issueMobileAccessToken(SUBJECT, { ...CONFIG, audience: "something-else" }, NOW);
    assert.equal(await verifyMobileAccessToken(token, CONFIG, NOW), null);
  });

  it("rejects an expired token", async () => {
    const { token } = await issueMobileAccessToken(SUBJECT, CONFIG, NOW);
    const afterExpiry = at(CONFIG.ttlSeconds + MOBILE_ACCESS_TOKEN_CLOCK_TOLERANCE_SECONDS + 1);
    assert.equal(await verifyMobileAccessToken(token, CONFIG, afterExpiry), null);
  });

  it("accepts under 60 seconds of clock skew, and no more", async () => {
    const { token } = await issueMobileAccessToken(SUBJECT, CONFIG, NOW);
    assert.ok(await verifyMobileAccessToken(token, CONFIG, at(CONFIG.ttlSeconds + 30)), "30s past exp");
    assert.ok(await verifyMobileAccessToken(token, CONFIG, at(CONFIG.ttlSeconds + 59)), "59s past exp");
    // The bound is exclusive: exactly 60s past exp is already expired.
    assert.equal(await verifyMobileAccessToken(token, CONFIG, at(CONFIG.ttlSeconds + 60)), null, "60s past exp");
    assert.equal(await verifyMobileAccessToken(token, CONFIG, at(CONFIG.ttlSeconds + 61)), null, "61s past exp");
    assert.ok(await verifyMobileAccessToken(token, CONFIG, at(-60)), "issued 60s in the verifier's future");
  });

  it("rejects an iat further in the future than the tolerance", async () => {
    const future = NOW_S + MOBILE_ACCESS_TOKEN_CLOCK_TOLERANCE_SECONDS + 5;
    const token = await sign({ ...VALID_CLAIMS, iat: future, exp: future + CONFIG.ttlSeconds });
    assert.equal(await verifyMobileAccessToken(token, CONFIG, NOW), null);
  });

  it("rejects a token whose exp outlives its TTL", async () => {
    const token = await sign({ ...VALID_CLAIMS, iat: NOW_S - 2 * CONFIG.ttlSeconds, exp: NOW_S + CONFIG.ttlSeconds });
    assert.equal(await verifyMobileAccessToken(token, CONFIG, NOW), null);
  });

  it("rejects a token missing any required claim", async () => {
    for (const claim of ["sub", "sid", "role", "authProvider", "iat", "exp"] as const) {
      const claims: Record<string, unknown> = { ...VALID_CLAIMS };
      delete claims[claim];
      assert.equal(await verifyMobileAccessToken(await sign(claims), CONFIG, NOW), null, `missing ${claim}`);
    }
  });

  it("rejects a role or provider outside the schema", async () => {
    assert.equal(await verifyMobileAccessToken(await sign({ ...VALID_CLAIMS, role: "admin" }), CONFIG, NOW), null);
    assert.equal(await verifyMobileAccessToken(await sign({ ...VALID_CLAIMS, authProvider: "credentials" }), CONFIG, NOW), null);
    assert.equal(await verifyMobileAccessToken(await sign({ ...VALID_CLAIMS, sid: "" }), CONFIG, NOW), null);
    assert.equal(await verifyMobileAccessToken(await sign({ ...VALID_CLAIMS, sid: 42 }), CONFIG, NOW), null);
  });

  it("rejects empty and garbage input", async () => {
    for (const token of ["", "not-a-jwt", "a.b.c"]) {
      assert.equal(await verifyMobileAccessToken(token, CONFIG, NOW), null);
    }
  });
});
