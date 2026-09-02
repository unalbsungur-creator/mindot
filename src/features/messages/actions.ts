"use server";

import { auth } from "@/features/auth/auth";
import { invitationRepository } from "@/features/invitations/repository";
import { getEffectiveStatus } from "@/features/invitations/types";
import { getNoteTemplate, isTemplateAvailable } from "@/features/notes/config/templates";
import { getModerationService } from "@/features/moderation/service";
import { messageRepository } from "./repository";
import { MESSAGE_MAX_LENGTH, type Message } from "./types";

export interface SubmitMessageInput {
  content: string;
  templateId: string;
  authorName: string;
  isAnonymous: boolean;
  language: string;
  invitationToken?: string;
}

export type SubmitMessageError =
  | "auth-required"
  | "empty-content"
  | "too-long"
  | "invalid-template"
  | "invitation-invalid"
  | "invitation-inactive";

export interface SubmitMessageResult {
  ok: boolean;
  error?: SubmitMessageError;
  message?: Message;
}

/**
 * Validates, AI-pre-screens, and stores a thought. The AI result is
 * advisory metadata attached to the message for the admin queue — it never
 * changes the outcome here. Every message reaches this function's end the
 * same way: saved with status "pending", waiting for a human. See
 * features/moderation for the pre-screen and "Human moderation authority"
 * in CLAUDE.md for why AI never gets to publish or reject on its own.
 */
export async function submitMessage(input: SubmitMessageInput): Promise<SubmitMessageResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "auth-required" };
  }

  const content = input.content.trim();
  if (!content) {
    return { ok: false, error: "empty-content" };
  }
  if ([...content].length > MESSAGE_MAX_LENGTH) {
    return { ok: false, error: "too-long" };
  }

  const template = getNoteTemplate(input.templateId);
  if (template.id !== input.templateId || !isTemplateAvailable(template)) {
    return { ok: false, error: "invalid-template" };
  }

  let invitationId: string | null = null;
  if (input.invitationToken) {
    const invitation = await invitationRepository.getByToken(input.invitationToken);
    if (!invitation || getEffectiveStatus(invitation) !== "active") {
      return { ok: false, error: invitation ? "invitation-inactive" : "invitation-invalid" };
    }
    invitationId = invitation.id;
    await invitationRepository.recordUse(input.invitationToken);
  }

  // Anonymity is enforced here, server-side, before anything is stored —
  // the browser is never trusted with it. If `isAnonymous`, the real name
  // the client sent is discarded entirely rather than stored-but-hidden.
  const authorName = input.isAnonymous
    ? "anonymous"
    : input.authorName.trim() || session.user.name || "anonymous";

  const aiResult = await getModerationService().analyzeMessage(content, { language: input.language });

  const message = await messageRepository.create({
    content,
    authorId: session.user.id,
    authorName,
    isAnonymous: input.isAnonymous,
    language: input.language,
    templateId: template.id,
    invitationId,
    aiModerationStatus: aiResult.decision,
    aiModerationProvider: aiResult.provider,
    aiModerationCategories: aiResult.categories,
    aiModerationReason: aiResult.reason,
    aiModerationConfidence: aiResult.confidence,
    aiModeratedAt: aiResult.moderatedAt,
  });

  return { ok: true, message };
}
