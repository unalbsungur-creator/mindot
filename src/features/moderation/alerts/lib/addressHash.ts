import type { AddressHash } from "../types";
import { normalizeAlertRecipient } from "./recipients";

/**
 * MN-01: a recipient's only stored identity — HMAC-SHA256 of the normalized
 * (case-folded) address under MODERATION_ALERT_HASH_KEY, as 64 lowercase hex
 * characters. Without the key, a stored hash can't be matched against a
 * guessed address list, so the delivery table holds nothing personal.
 *
 * Web Crypto (`crypto.subtle`), so it runs unchanged in Node and in the
 * Cloudflare Worker.
 */

/** A key shorter than this (UTF-8 bytes) is refused: alerts stay disabled ("hash-key-missing"). */
export const MIN_HASH_KEY_BYTES = 32;

export function isUsableHashKey(key: string | undefined): key is string {
  return typeof key === "string" && new TextEncoder().encode(key).byteLength >= MIN_HASH_KEY_BYTES;
}

export async function hashAlertRecipient(key: string, address: string): Promise<AddressHash> {
  if (!isUsableHashKey(key)) throw new RangeError("hash key too short");
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey("raw", encoder.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(normalizeAlertRecipient(address)));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
