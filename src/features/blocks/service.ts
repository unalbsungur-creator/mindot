import { messageRepository, type MessageRepository } from "@/features/messages/repository";
import { userRepository, type UserRepository } from "@/features/users/repository";
import { blockRepository, type BlockRepository } from "./repository";

export type BlockActionError = "auth-required" | "self-block" | "not-found";

export interface BlockActionResult {
  ok: boolean;
  error?: BlockActionError;
  /** `already-blocked` / `not-blocked`: the request was a no-op (idempotent). */
  status?: "blocked" | "already-blocked" | "unblocked" | "not-blocked";
  /** The target's public id — lets a caller that blocked "the author of note X" link to or unblock them later. */
  publicId?: string;
}

/** Authentication is the caller's job, so `auth-required` never comes from here. */
export type BlockServiceResult = Omit<BlockActionResult, "error"> & {
  error?: Exclude<BlockActionError, "auth-required">;
};

/**
 * Who a block/unblock request is about. Either a public wall id, or a board
 * note whose author to block — never a raw database id, which would expose
 * a user's Google `sub`. A note only resolves for an approved, *named*
 * message: an anonymous note's author can't be blocked (or probed — every
 * miss is the same `not-found`), so blocking never de-anonymizes anyone.
 */
export type BlockTarget = { publicId: string } | { messageId: string };

export interface BlockServiceDeps {
  blocks: Pick<BlockRepository, "block" | "unblock">;
  users: Pick<UserRepository, "getByPublicId" | "isActiveAccount" | "ensurePublicId">;
  messages: Pick<MessageRepository, "getById">;
}

const defaultDeps: BlockServiceDeps = {
  blocks: blockRepository,
  users: userRepository,
  messages: messageRepository,
};

async function resolveTargetUserId(target: BlockTarget, deps: BlockServiceDeps): Promise<string | null> {
  if (typeof target !== "object" || target === null) return null;
  if ("publicId" in target && typeof target.publicId === "string" && target.publicId) {
    const user = await deps.users.getByPublicId(target.publicId);
    return user ? user.id : null;
  }
  if ("messageId" in target && typeof target.messageId === "string" && target.messageId) {
    const message = await deps.messages.getById(target.messageId);
    if (!message || message.status !== "approved" || message.isAnonymous) return null;
    return (await deps.users.isActiveAccount(message.authorId)) ? message.authorId : null;
  }
  return null;
}

/**
 * The blocker is decided by the caller — always its own authenticated
 * account, never client input — so nobody can block on someone else's
 * behalf. Check order: target → self-block → block → public id.
 */
export async function blockUserAsBlocker(
  blockerUserId: string,
  target: BlockTarget,
  deps: BlockServiceDeps = defaultDeps
): Promise<BlockServiceResult> {
  const targetId = await resolveTargetUserId(target, deps);
  if (!targetId) return { ok: false, error: "not-found" };
  if (targetId === blockerUserId) return { ok: false, error: "self-block" };

  const status = await deps.blocks.block(blockerUserId, targetId);
  // Guarantees the block can be managed (listed, undone) by public id.
  const publicId = await deps.users.ensurePublicId(targetId);
  return { ok: true, status, publicId };
}

export async function unblockUserAsBlocker(
  blockerUserId: string,
  target: { publicId: string },
  deps: BlockServiceDeps = defaultDeps
): Promise<BlockServiceResult> {
  const targetId = await resolveTargetUserId(target, deps);
  if (!targetId) return { ok: false, error: "not-found" };

  const status = await deps.blocks.unblock(blockerUserId, targetId);
  return { ok: true, status, publicId: target.publicId };
}
