"use server";

import { auth } from "@/features/auth/auth";
import { likeMessageAsVisitor, type LikeResult } from "./service";

export type { LikeResult } from "./service";

/**
 * EPIC: Message Like System — the web entry point (InfiniteBoard). Only the
 * session is read here; identity resolution (a signed-in session id always
 * wins over the client-supplied `anonymousId`) and the like itself live in
 * likeMessageAsVisitor (./service), shared with any future non-web caller.
 */
export async function likeMessage(messageId: string, anonymousId?: string): Promise<LikeResult> {
  const session = await auth();
  return likeMessageAsVisitor({ messageId, userId: session?.user?.id ?? null, anonymousId });
}
