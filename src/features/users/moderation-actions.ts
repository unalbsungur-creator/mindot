"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/features/auth/auth";
import { userRepository } from "./repository";

const MAX_REASON_LENGTH = 500;

export type UserModerationError = "unauthorized" | "not-found" | "cannot-suspend-self" | "already-suspended" | "not-suspended";

export interface UserModerationResult {
  ok: boolean;
  error?: UserModerationError;
}

async function requireAdmin() {
  const session = await auth();
  if (session?.user?.role !== "admin") return null;
  return session.user;
}

/**
 * Blocks a user's ability to submit new content — see `submitMessage`'s
 * own fresh `userRepository.getById` re-check in features/messages/
 * actions.ts, which is the actual enforcement point. This action only
 * flips the account's own `status`; it never touches any existing message
 * — see CLAUDE.md's "Suspension semantics" for why that's the deliberate
 * product decision, not an oversight.
 *
 * Self-suspension is blocked outright — not a security boundary (role
 * still governs admin access regardless of suspension status), just a
 * product safety rail against an admin accidentally locking their own
 * account out of posting. Admin-suspends-another-admin is allowed: this
 * codebase has no admin hierarchy above the flat `role` enum, and
 * suspension only ever affects submission eligibility, never permissions
 * — see schema.ts's `userAccountStatusEnum` doc comment.
 */
export async function suspendUser(userId: string, reason?: string): Promise<UserModerationResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "unauthorized" };
  if (admin.id === userId) return { ok: false, error: "cannot-suspend-self" };

  const target = await userRepository.getById(userId);
  if (!target) return { ok: false, error: "not-found" };

  const trimmedReason = reason?.trim().slice(0, MAX_REASON_LENGTH) || null;
  const updated = await userRepository.suspend(userId, admin.id, trimmedReason);
  if (!updated) return { ok: false, error: "already-suspended" };

  revalidatePath("/admin/users");
  return { ok: true };
}

/**
 * Re-enables submission. Deliberately never touches `messages` — since
 * suspend() never archived anything, unsuspend() has nothing to restore.
 * This is exactly the property CLAUDE.md's "Suspension semantics" section
 * requires: suspend → unsuspend can never silently bypass a genuine
 * moderation decision, because the two systems never interact.
 */
export async function unsuspendUser(userId: string): Promise<UserModerationResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "unauthorized" };

  const updated = await userRepository.unsuspend(userId, admin.id);
  if (!updated) return { ok: false, error: "not-suspended" };

  revalidatePath("/admin/users");
  return { ok: true };
}
