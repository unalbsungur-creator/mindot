import { invitationRepository, type InvitationRepository } from "@/features/invitations/repository";
import { getEffectiveStatus } from "@/features/invitations/types";
import { getModerationService } from "@/features/moderation/service";
import type { ModerationService } from "@/features/moderation/types";
import { getNoteTemplate, isTemplateAvailable } from "@/features/notes/config/templates";
import type { NoteTextFontFamily } from "@/features/notes/types";
import { userRepository, type UserRepository } from "@/features/users/repository";
import { CONTENT_CONSENT_VERSION } from "./consent";
import { maxMessageLength } from "./lib/messageLength";
import { messageRepository, type MessageRepository } from "./repository";
import { MESSAGE_MAX_LENGTH, type Message } from "./types";

// EPIC — Kart Yazı Tipi Seçenekleri: the closed set `WriteThoughtForm`'s
// font picker can actually send — an unrecognized/missing value here
// (a stale client build, a hand-crafted request) falls back to "modern",
// the same default a pre-this-feature message already gets from the DB
// column's own default — never trusted from the client without this check.
const VALID_FONT_FAMILIES: readonly NoteTextFontFamily[] = [
  "modern",
  "classic",
  "handwritten",
  "typewriter",
  "serif",
  "mono",
  "elegant",
  "bold",
];
const DEFAULT_FONT_FAMILY: NoteTextFontFamily = "modern";

export interface SubmitMessageInput {
  content: string;
  templateId: string;
  /** EPIC — Kart Yazı Tipi Seçenekleri: optional — an older client build simply won't send it, and the server falls back to `DEFAULT_FONT_FAMILY` ("modern") exactly like a pre-this-feature message already does. */
  fontFamily?: string;
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

/**
 * Who is submitting, decided by the caller — never by this module, which
 * has no request context. `authorId` is an already-authenticated account
 * id; `fallbackAuthorName` is the display name used for a named note whose
 * typed name is blank (the web passes the session's name).
 */
export interface SubmitMessageParams extends SubmitMessageInput {
  authorId: string;
  fallbackAuthorName: string | null;
}

/** Authentication is the caller's job, so `auth-required` never comes from here. */
export type SubmitMessageServiceResult =
  | { ok: true; message: Message }
  | { ok: false; error: Exclude<SubmitMessageError, "auth-required"> };

export interface SubmitMessageDeps {
  users: Pick<UserRepository, "getById">;
  messages: Pick<MessageRepository, "countRecentByAuthor" | "create">;
  invitations: Pick<InvitationRepository, "getByToken" | "recordUse">;
  /** Resolved per submission, never at module load: the provider is chosen from the environment at call time. */
  moderation: () => ModerationService;
}

const defaultDeps: SubmitMessageDeps = {
  users: userRepository,
  messages: messageRepository,
  invitations: invitationRepository,
  moderation: getModerationService,
};

/**
 * Validates, AI-pre-screens, and stores a thought. The AI result is
 * advisory metadata attached to the message for the admin queue — it never
 * changes the outcome here. Every message reaches this function's end the
 * same way: saved with status "pending", waiting for a human. See
 * features/moderation for the pre-screen and "Human moderation authority"
 * in CLAUDE.md for why AI never gets to publish or reject on its own.
 *
 * The check order is part of the contract (it decides which error a writer
 * sees when several apply): suspension → rate limit → consent → content →
 * template → card limit → invitation.
 */
export async function submitMessageForAuthor(
  params: SubmitMessageParams,
  deps: SubmitMessageDeps = defaultDeps
): Promise<SubmitMessageServiceResult> {
  // EPIC 013: User Blocking / Suspension. Deliberately a fresh DB read, not
  // `session.user.role`-style JWT-embedded state: a JWT only refreshes at
  // sign-in, so trusting it here would mean a newly-suspended user could
  // keep submitting for the rest of their existing session — the opposite
  // of what "suspend this account right now" is supposed to mean. This is
  // the single entry point every message-creation path goes through
  // (`/write` and `/invite/[token]` both call this same function), so
  // gating here covers both without a second check anywhere else.
  const author = await deps.users.getById(params.authorId);
  if (author?.status === "suspended") {
    return { ok: false, error: "account-suspended" };
  }

  // EPIC 018: same "fresh read, before any write" discipline as the
  // suspension check above — the caller's authenticated id, never a
  // client-supplied identity, and this happens before the DB insert, not after.
  const recentCount = await deps.messages.countRecentByAuthor(params.authorId, SUBMIT_RATE_LIMIT_WINDOW_MINUTES);
  if (recentCount >= SUBMIT_RATE_LIMIT_MAX) {
    return { ok: false, error: "rate-limited" };
  }

  if (!params.consentAccepted || params.consentVersion !== CONTENT_CONSENT_VERSION) {
    return { ok: false, error: "consent-required" };
  }

  const content = params.content.trim();
  if (!content) {
    return { ok: false, error: "empty-content" };
  }
  if ([...content].length > MESSAGE_MAX_LENGTH) {
    return { ok: false, error: "too-long" };
  }

  const template = getNoteTemplate(params.templateId);
  if (template.id !== params.templateId || !isTemplateAvailable(template)) {
    return { ok: false, error: "invalid-template" };
  }
  // A card can be stricter than the global limit above (the new illustrated
  // Standard cards take 100 characters) — enforced here, not only in the form.
  if ([...content].length > maxMessageLength(template.id)) {
    return { ok: false, error: "too-long" };
  }

  const fontFamily: NoteTextFontFamily = VALID_FONT_FAMILIES.includes(params.fontFamily as NoteTextFontFamily)
    ? (params.fontFamily as NoteTextFontFamily)
    : DEFAULT_FONT_FAMILY;

  let invitationId: string | null = null;
  if (params.invitationToken) {
    const invitation = await deps.invitations.getByToken(params.invitationToken);
    if (!invitation || getEffectiveStatus(invitation) !== "active") {
      return { ok: false, error: invitation ? "invitation-inactive" : "invitation-invalid" };
    }
    invitationId = invitation.id;
    await deps.invitations.recordUse(params.invitationToken);
  }

  // Anonymity is enforced here, server-side, before anything is stored —
  // the client is never trusted with it. If `isAnonymous`, the real name
  // the client sent is discarded entirely rather than stored-but-hidden.
  const authorName = params.isAnonymous
    ? "anonymous"
    : params.authorName.trim() || params.fallbackAuthorName || "anonymous";

  const aiResult = await deps.moderation().analyzeMessage(content, { language: params.language });

  const message = await deps.messages.create({
    content,
    authorId: params.authorId,
    authorName,
    isAnonymous: params.isAnonymous,
    language: params.language,
    templateId: template.id,
    fontFamily,
    invitationId,
    aiModerationStatus: aiResult.decision,
    aiModerationProvider: aiResult.provider,
    aiModerationCategories: aiResult.categories,
    aiModerationReason: aiResult.reason,
    aiModerationConfidence: aiResult.confidence,
    aiModeratedAt: aiResult.moderatedAt,
    consentAccepted: params.consentAccepted,
    consentVersion: params.consentVersion,
  });

  return { ok: true, message };
}
