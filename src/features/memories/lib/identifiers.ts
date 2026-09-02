import { randomFromAlphabet } from "@/lib/randomCode";

/**
 * A physical fulfilment order number, e.g. "MND-2026-7K3PXQ9H" — short
 * enough to type into a DilekKutum order note, collision-resistant
 * (31^8 ≈ 8.5×10^11 combinations), and case-insensitive by convention
 * (always generated and compared uppercase).
 */
export function generateOrderNumber(): string {
  const year = new Date().getFullYear();
  return `MND-${year}-${randomFromAlphabet(8)}`;
}

/**
 * A digital access code a buyer types in manually, e.g.
 * "XXXX-XXXX-XXXX-XXXX" (~78 bits of entropy from the safe alphabet —
 * not guessable, but still short enough to read off a receipt).
 */
export function generateAccessCode(): string {
  const groups = [randomFromAlphabet(4), randomFromAlphabet(4), randomFromAlphabet(4), randomFromAlphabet(4)];
  return groups.join("-");
}

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}
