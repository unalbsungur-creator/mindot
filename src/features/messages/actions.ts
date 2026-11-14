"use server";

import { auth } from "@/features/auth/auth";
import { scheduleModerationAlert } from "@/features/moderation/alerts/trigger";
import { schedulePrescreenThenAlert } from "@/features/moderation/prescreen";
import { submitMessageForAuthor, type SubmitMessageError, type SubmitMessageInput } from "./service";

export type { SubmitMessageError, SubmitMessageInput } from "./service";

/**
 * What the writer's browser gets back. Deliberately no stored message: it
 * carries the admin-only AI pre-screen fields (CLAUDE.md "AI moderation
 * data is admin-only"), and the write form needs only ok/error.
 */
export interface SubmitMessageResult {
  ok: boolean;
  error?: SubmitMessageError;
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

  const result = await submitMessageForAuthor({
    ...input,
    authorId: session.user.id,
    fallbackAuthorName: session.user.name ?? null,
  });
  // MN-01: a new card joined the review queue — alert the admins after the
  // response. With the queue empty before it, the first alert goes out now;
  // the run never throws and never changes this result.
  // Security pack 2b: with a deferred AI pre-screen (Workers AI), the
  // pre-screen runs first and the alert after it — both after the response.
  if (result.ok) {
    if (result.prescreenDeferred) schedulePrescreenThenAlert(result.message);
    else scheduleModerationAlert();
    return { ok: true };
  }
  return { ok: false, error: result.error };
}
