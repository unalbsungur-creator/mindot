import { randomFromAlphabet } from "@/lib/randomCode";

/**
 * A short, opaque public identifier for a user's shareable wall URL
 * (/u/[publicId]) — never the Google sub or this row's database id. ~10
 * chars from the safe alphabet (31^10 ≈ 6.5×10^14 combinations):
 * effectively collision-free, and the repository still retries on the
 * astronomically unlikely case of a collision (same pattern as
 * features/memories/lib/identifiers.ts).
 */
export function generatePublicId(): string {
  return randomFromAlphabet(10);
}
