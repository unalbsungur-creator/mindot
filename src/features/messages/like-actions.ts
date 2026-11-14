"use server";

import { auth } from "@/features/auth/auth";
import { setMessageLike, type LikeResult } from "./service";

export type { LikeResult } from "./service";

/**
 * EPIC: Message Like System — the web entry point (InfiniteBoard). Security
 * pack 2b: likes need an account. The identity is only ever the server
 * session's — nothing the client sends can choose who is liking — and a
 * visitor without a session gets `sign-in-required` (the board then points
 * them to sign in). `liked` is the state wanted (like / take back), see
 * setMessageLike (./service).
 */
export async function setLike(messageId: string, liked: boolean): Promise<LikeResult> {
  const session = await auth();
  return setMessageLike({ messageId, userId: session?.user?.id ?? null, liked: liked === true });
}
