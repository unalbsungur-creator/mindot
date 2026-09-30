"use server";

import { auth } from "@/features/auth/auth";
import { messageRepository } from "@/features/messages/repository";
import { userRepository } from "@/features/users/repository";
import { blockRepository } from "./repository";

export type BlockActionError = "auth-required" | "self-block" | "not-found";

export interface BlockActionResult {
  ok: boolean;
  error?: BlockActionError;
  /** `already-blocked` / `not-blocked`: the request was a no-op (idempotent). */
  status?: "blocked" | "already-blocked" | "unblocked" | "not-blocked";
  /** The target's public id — lets a caller that blocked "the author of note X" link to or unblock them later. */
  publicId?: string;
}

/**
 * Who a block/unblock request is about. Either a public wall id, or a board
 * note whose author to block — never a raw database id, which would expose
 * a user's Google `sub`. A note only resolves for an approved, *named*
 * message: an anonymous note's author can't be blocked (or probed — every
 * miss is the same `not-found`), so blocking never de-anonymizes anyone.
 */
export type BlockTarget = { publicId: string } | { messageId: string };

async function resolveTargetUserId(target: BlockTarget): Promise<string | null> {
  if (typeof target !== "object" || target === null) return null;
  if ("publicId" in target && typeof target.publicId === "string" && target.publicId) {
    const user = await userRepository.getByPublicId(target.publicId);
    return user ? user.id : null;
  }
  if ("messageId" in target && typeof target.messageId === "string" && target.messageId) {
    const message = await messageRepository.getById(target.messageId);
    if (!message || message.status !== "approved" || message.isAnonymous) return null;
    return (await userRepository.isActiveAccount(message.authorId)) ? message.authorId : null;
  }
  return null;
}

/**
 * The blocker is always the session's account — never client input — so
 * nobody can block or unblock on someone else's behalf. Server Actions
 * carry Next.js's same-origin check against cross-site calls.
 */
export async function blockUser(target: BlockTarget): Promise<BlockActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "auth-required" };

  const targetId = await resolveTargetUserId(target);
  if (!targetId) return { ok: false, error: "not-found" };
  if (targetId === session.user.id) return { ok: false, error: "self-block" };

  const status = await blockRepository.block(session.user.id, targetId);
  // Guarantees the block can be managed (listed, undone) by public id.
  const publicId = await userRepository.ensurePublicId(targetId);
  return { ok: true, status, publicId };
}

export async function unblockUser(target: { publicId: string }): Promise<BlockActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "auth-required" };

  const targetId = await resolveTargetUserId(target);
  if (!targetId) return { ok: false, error: "not-found" };

  const status = await blockRepository.unblock(session.user.id, targetId);
  return { ok: true, status, publicId: target.publicId };
}
