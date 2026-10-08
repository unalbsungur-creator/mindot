"use server";

import { auth } from "@/features/auth/auth";
import { submitMessageForAuthor, type SubmitMessageError, type SubmitMessageInput } from "./service";
import type { Message } from "./types";

export type { SubmitMessageError, SubmitMessageInput } from "./service";

export interface SubmitMessageResult {
  ok: boolean;
  error?: SubmitMessageError;
  message?: Message;
}

/**
 * The web entry point for writing a thought (`WriteThoughtForm`, both
 * `/write` and `/invite/[token]`). Only the session is read here — the
 * author is always the signed-in account, never anything the client sent —
 * and every rule (suspension, rate limit, consent, content, template,
 * invitation, anonymity, AI pre-screen, pending status) lives in
 * submitMessageForAuthor (./service), shared with any future non-web caller.
 */
export async function submitMessage(input: SubmitMessageInput): Promise<SubmitMessageResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "auth-required" };
  }

  return submitMessageForAuthor({
    ...input,
    authorId: session.user.id,
    fallbackAuthorName: session.user.name ?? null,
  });
}
