/**
 * Generates the Sign in with Apple *client secret* — an ES256-signed JWT
 * Apple requires in place of a static secret, valid for at most 6 months.
 * Run with `npm run auth:apple-secret`, then store the printed value as
 * AUTH_APPLE_SECRET (in .env.local for local use, or the deployment's secret
 * store — never in a committed file) and re-run before the printed expiry.
 *
 * Reads, from the environment (.env.local is loaded if present):
 *   AUTH_APPLE_ID           the Services ID (the web OAuth client id)
 *   APPLE_TEAM_ID           the Apple Developer team id
 *   APPLE_KEY_ID            the Sign in with Apple key's id
 *   APPLE_PRIVATE_KEY_PATH  path to that key's .p8 file — keep it OUTSIDE
 *                           this repository
 *
 * The private key is only read here, at generation time — it is never a
 * runtime variable of the app — and neither it nor anything derived from
 * it except the finished client secret is ever printed.
 *
 * Node's built-in crypto only (no new dependency), same "no extra tooling"
 * approach as the db:* scripts.
 */
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local — fine, the variables may come from the shell.
}

import { createPrivateKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

// Apple's documented maximum is 15,777,000 seconds (~6 months); stay a day under.
const LIFETIME_SECONDS = 15_777_000 - 86_400;

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function main() {
  const clientId = process.env.AUTH_APPLE_ID?.trim();
  const teamId = process.env.APPLE_TEAM_ID?.trim();
  const keyId = process.env.APPLE_KEY_ID?.trim();
  const keyPath = process.env.APPLE_PRIVATE_KEY_PATH?.trim();

  const missing = [
    ["AUTH_APPLE_ID", clientId],
    ["APPLE_TEAM_ID", teamId],
    ["APPLE_KEY_ID", keyId],
    ["APPLE_PRIVATE_KEY_PATH", keyPath],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length > 0 || !clientId || !teamId || !keyId || !keyPath) {
    console.error(`Missing: ${missing.join(", ")}. See the comment at the top of src/lib/createAppleClientSecret.ts.`);
    process.exitCode = 1;
    return;
  }

  const resolvedKeyPath = path.resolve(keyPath);
  if (resolvedKeyPath.startsWith(path.resolve(".") + path.sep)) {
    console.error("Refusing to read a private key stored inside the repository. Move the .p8 file outside it.");
    process.exitCode = 1;
    return;
  }

  let privateKey;
  try {
    privateKey = createPrivateKey(readFileSync(resolvedKeyPath, "utf8"));
  } catch {
    console.error("Could not read APPLE_PRIVATE_KEY_PATH as a PEM private key (.p8).");
    process.exitCode = 1;
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", kid: keyId, typ: "JWT" };
  const payload = { iss: teamId, iat: now, exp: now + LIFETIME_SECONDS, aud: "https://appleid.apple.com", sub: clientId };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  // JWS ES256 wants the raw r||s signature, not DER.
  const signature = sign("sha256", Buffer.from(signingInput), { key: privateKey, dsaEncoding: "ieee-p1363" });

  console.log(`${signingInput}.${base64url(signature)}`);
  console.error(`\nSet the line above as AUTH_APPLE_SECRET. It expires ${new Date((now + LIFETIME_SECONDS) * 1000).toISOString()} — regenerate before then.`);
}

main();
