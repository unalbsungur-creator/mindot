import { randomBytes } from "node:crypto";

/** Excludes 0/O, 1/I/L — characters that are easy to mistype or misread. Shared by every feature that generates a human-facing or URL-facing random code (memories' order numbers/access codes, users' public wall ids) — one alphabet, not a copy per feature. */
export const SAFE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function randomFromAlphabet(length: number, alphabet: string = SAFE_ALPHABET): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}
