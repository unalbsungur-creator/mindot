"use server";

import { auth } from "@/features/auth/auth";
import { invitationRepository } from "@/features/invitations/repository";
import { getEffectiveStatus } from "@/features/invitations/types";
import { getNoteTemplate, isTemplateAvailable } from "@/features/notes/config/templates";
import { getModerationService } from "@/features/moderation/service";
import { userRepository } from "@/features/users/repository";
import { CONTENT_CONSENT_VERSION } from "./consent";
import { messageRepository } from "./repository";
import { MESSAGE_MAX_LENGTH, type Message } from "./types";

export interface SubmitMessageInput {
  content: string;
  templateId: string;
  authorName: string;
  isAnonymous: boolean;
  language: string;
  invitationToken?: string;
  /**
   * The content-responsibility consent `WriteThoughtForm` now requires
   * before either the "Continue with Google" or the submit button is even
   * clickable (see "Mandatory content-responsibility consent" in
   * CLAUDE.md). Re-checked here too, not just trusted from the UI state
   * that produced it — the same "don't rely on client-side disabled alone"
   * principle already applied to `isAnonymous` (enforced server-side, not
   * merely respected). Rejecting an invalid/stale consent here means the
   * DB insert never happens at all — see the early return below. On
   * success, this is also persisted as a durable audit record (`messages.
   * consentAccepted`/`consentVersion`/`consentAcceptedAt`, EPIC: Consent
   * Audit Persistence) — `messageRepository.create()` re-derives the
   * actual stored values from a server-side timestamp rather than trusting
   * this input verbatim; see its own comment.
   */
  consentAccepted: boolean;
  consentVersion: string;
}

export type SubmitMessageError =
  | "auth-required"
  | "account-suspended"
  | "rate-limited"
  | "consent-required"
  | "empty-content"
  | "too-long"
  | "invalid-template"
  | "invitation-invalid"
  | "invitation-inactive";

// EPIC 018: a real submission-velocity cap, server-side, before any DB
// insert — closes the one gap the moderation/suspension arc (013-015)
// never covered: nothing stopped a single (even legitimate, unsuspended)
// account from flooding the moderation queue. Generous enough that a
// writer composing several notes in one sitting (e.g. birthday cards for
// multiple people) is never blocked — five in ten minutes is well beyond
// normal single-person usage.
const SUBMIT_RATE_LIMIT_MAX = 5;
const SUBMIT_RATE_LIMIT_WINDOW_MINUTES = 10;

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

  // EPIC 013: User Blocking / Suspension. Deliberately a fresh DB read, not
  // `session.user.role`-style JWT-embedded state: a JWT only refreshes at
  // sign-in, so trusting it here would mean a newly-suspended user could
  // keep submitting for the rest of their existing session — the opposite
  // of what "suspend this account right now" is supposed to mean. This is
  // the single entry point every message-creation path goes through
  // (`/write` and `/invite/[token]` both call this same function), so
  // gating here covers both without a second check anywhere else.
  const author = await userRepository.getById(session.user.id);
  if (author?.status === "suspended") {
    return { ok: false, error: "account-suspended" };
  }

  // EPIC 018: same "fresh read, before any write" discipline as the
  // suspension check above — session.user.id, never a client-supplied
  // identity, and this happens before the DB insert, not after.
  const recentCount = await messageRepository.countRecentByAuthor(session.user.id, SUBMIT_RATE_LIMIT_WINDOW_MINUTES);
  if (recentCount >= SUBMIT_RATE_LIMIT_MAX) {
    return { ok: false, error: "rate-limited" };
  }

  if (!input.consentAccepted || input.consentVersion !== CONTENT_CONSENT_VERSION) {
    return { ok: false, error: "consent-required" };
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
    consentAccepted: input.consentAccepted,
    consentVersion: input.consentVersion,
  });

  return { ok: true, message };
}
