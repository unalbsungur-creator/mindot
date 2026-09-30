/**
 * Encryption for stored Sign in with Apple refresh tokens — AES-256-GCM
 * through WebCrypto (the same API on Node and Cloudflare Workers), keyed by
 * AUTH_APPLE_TOKEN_KEY: 32 random bytes, base64, a server-only secret that
 * never reaches the client or the database.
 *
 * Stored form: `v1.<iv>.<ciphertext+tag>` (base64url). The owning user id
 * is bound in as additional authenticated data, so a ciphertext copied onto
 * another user's row fails to decrypt instead of revoking someone else's
 * Apple authorization. The version prefix leaves room for key rotation.
 */
const VERSION = "v1";
const IV_BYTES = 12;

function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  return Buffer.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).toString("base64url");
}

async function importKey(base64Key: string): Promise<CryptoKey> {
  const raw = Buffer.from(base64Key, "base64");
  if (raw.length !== 32) throw new Error("AUTH_APPLE_TOKEN_KEY must be 32 bytes, base64-encoded.");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptAppleToken(plaintext: string, userId: string, base64Key: string): Promise<string> {
  const key = await importKey(base64Key);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(userId) },
    key,
    new TextEncoder().encode(plaintext)
  );
  return `${VERSION}.${toBase64Url(iv)}.${toBase64Url(ciphertext)}`;
}

/** `null` for anything that doesn't decrypt under this key for this user (tampered, other row, other key). */
export async function decryptAppleToken(stored: string, userId: string, base64Key: string): Promise<string | null> {
  const [version, ivPart, dataPart] = stored.split(".");
  if (version !== VERSION || !ivPart || !dataPart) return null;
  try {
    const key = await importKey(base64Key);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: Buffer.from(ivPart, "base64url"), additionalData: new TextEncoder().encode(userId) },
      key,
      Buffer.from(dataPart, "base64url")
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    return null;
  }
}
