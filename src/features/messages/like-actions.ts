"use server";

import { auth } from "@/features/auth/auth";
import { messageRepository } from "./repository";

export interface LikeResult {
  ok: boolean;
  likeCount: number;
  alreadyLiked: boolean;
}

/**
 * EPIC: Message Like System. A signed-in visitor's own session id is
 * always used when present — never the client-supplied `anonymousId`,
 * even if one was sent alongside it, so a signed-in user can't end up
 * split across two identities. `anonymousId` (from
 * src/lib/anonymousId.ts) is the fallback for a visitor with no session
 * at all. The real state boundary is `messageRepository.like()`'s atomic
 * insert against message_likes' unique index — this function is routing
 * plus identity resolution, not the guarantee itself.
 */
export async function likeMessage(messageId: string, anonymousId?: string): Promise<LikeResult> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId && !anonymousId) {
    return { ok: false, likeCount: 0, alreadyLiked: false };
  }

  return messageRepository.like(messageId, userId ? { userId } : { anonymousId });
}
