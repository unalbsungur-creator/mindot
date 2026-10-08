"use server";

import { auth } from "@/features/auth/auth";
import { blockUserAsBlocker, unblockUserAsBlocker, type BlockActionResult, type BlockTarget } from "./service";

export type { BlockActionError, BlockActionResult, BlockTarget } from "./service";

/**
 * The blocker is always the session's account — never client input — so
 * nobody can block or unblock on someone else's behalf. Server Actions
 * carry Next.js's same-origin check against cross-site calls. Every rule
 * (target resolution, self-block, idempotent block, public id) lives in
 * ./service, shared with any future non-web caller.
 */
export async function blockUser(target: BlockTarget): Promise<BlockActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "auth-required" };

  return blockUserAsBlocker(session.user.id, target);
}

export async function unblockUser(target: { publicId: string }): Promise<BlockActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "auth-required" };

  return unblockUserAsBlocker(session.user.id, target);
}
