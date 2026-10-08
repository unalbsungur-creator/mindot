import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import { compareRefreshSecret, generateRefreshToken, hashRefreshSecret, parseRefreshToken } from "./refreshToken";

const SID = "550e8400-e29b-41d4-a716-446655440000";

describe("refresh token", () => {
  it("generates <sid>.<secret> with a 32-byte base64url secret", () => {
    const { token } = generateRefreshToken(SID);
    const [sid, secret, ...rest] = token.split(".");
    assert.equal(sid, SID);
    assert.equal(rest.length, 0);
    assert.match(secret, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(Buffer.from(secret, "base64url").length, 32);
  });

  it("returns the hash of the secret part only, never of the whole token", () => {
    const { token, secretHash } = generateRefreshToken(SID);
    const secret = token.split(".")[1];
    assert.equal(secretHash, hashRefreshSecret(secret));
    assert.notEqual(secretHash, hashRefreshSecret(token));
    assert.ok(!secretHash.includes(secret));
  });

  it("generates a different secret every time", () => {
    const first = generateRefreshToken(SID);
    const second = generateRefreshToken(SID);
    assert.notEqual(first.token, second.token);
    assert.notEqual(first.secretHash, second.secretHash);
  });

  it("refuses a sid that isn't a server-generated UUID", () => {
    for (const sid of ["", "not-a-uuid", `${SID}.extra`, SID.toUpperCase()]) {
      assert.throws(() => generateRefreshToken(sid), Error, sid);
    }
  });

  it("parses back the sid and secret", () => {
    const sid = randomUUID();
    const { token } = generateRefreshToken(sid);
    assert.deepEqual(parseRefreshToken(token), { sid, secret: token.split(".")[1] });
  });

  it("rejects empty and non-string input", () => {
    for (const token of ["", undefined, null, 42, {}]) {
      assert.equal(parseRefreshToken(token), null);
    }
  });

  it("rejects malformed tokens", () => {
    const { token } = generateRefreshToken(SID);
    const secret = token.split(".")[1];
    const malformed = [
      secret,
      SID,
      `${SID}.`,
      `.${secret}`,
      `${SID}.${secret}.extra`,
      `not-a-uuid.${secret}`,
      `${SID}.${secret.slice(1)}`,
      `${SID}.${secret}A`,
      `${SID}.${secret.slice(1)}+`,
      ` ${token}`,
    ];
    for (const candidate of malformed) {
      assert.equal(parseRefreshToken(candidate), null, candidate);
    }
  });

  it("hashes deterministically: same secret, same hash; different secret, different hash", () => {
    assert.equal(hashRefreshSecret("abc"), hashRefreshSecret("abc"));
    assert.notEqual(hashRefreshSecret("abc"), hashRefreshSecret("abd"));
    assert.match(hashRefreshSecret("abc"), /^[0-9a-f]{64}$/);
    // Known SHA-256 vector.
    assert.equal(hashRefreshSecret("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("compares a matching secret as true and a wrong one as false", () => {
    const { token, secretHash } = generateRefreshToken(SID);
    const parsed = parseRefreshToken(token);
    assert.ok(parsed);
    assert.equal(compareRefreshSecret(parsed.secret, secretHash), true);
    const other = parseRefreshToken(generateRefreshToken(SID).token);
    assert.ok(other);
    assert.equal(compareRefreshSecret(other.secret, secretHash), false);
  });

  it("never matches a malformed stored hash", () => {
    const { token, secretHash } = generateRefreshToken(SID);
    const secret = token.split(".")[1];
    for (const stored of ["", secretHash.slice(1), secretHash.toUpperCase(), `${secretHash}00`, "z".repeat(64)]) {
      assert.equal(compareRefreshSecret(secret, stored), false, stored);
    }
  });
});
