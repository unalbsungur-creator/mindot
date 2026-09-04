export type MessageStatus = "pending" | "approved" | "rejected" | "archived";
export type AiModerationDecision = "safe" | "review" | "blocked";

export interface Message {
  id: string;
  content: string;
  authorId: string;
  authorName: string;
  isAnonymous: boolean;
  /** EPIC 011: owner-controlled curation — eligible (approved + named) doesn't mean shown; see setShowOnPersonalWall. Never affects global board visibility. */
  showOnPersonalWall: boolean;
  /** Denormalized count kept in sync with message_likes — see repository.ts's like(). */
  likeCount: number;
  language: string;
  templateId: string;
  invitationId: string | null;
  status: MessageStatus;
  // Null until the message is approved and placed on the board.
  tileX: number | null;
  tileY: number | null;
  positionX: number | null;
  positionY: number | null;
  rotation: number | null;
  createdAt: string;
  updatedAt: string;
  // Human moderation — the only thing that can move status out of "pending".
  moderatedAt: string | null;
  moderatedBy: string | null;
  // EPIC 014: the admin's own written reason for their most recent
  // approve/reject/archive decision. Optional; overwritten (not appended)
  // by every subsequent transition, cleared to null by restore/reconsider.
  // Never confuse with aiModerationReason (AI's own advisory output).
  moderationReason: string | null;
  // AI pre-screen, recorded at submission time. Advisory only — never
  // publishes or rejects on its own. Null on rows from before this existed.
  aiModerationStatus: AiModerationDecision | null;
  aiModerationProvider: string | null;
  aiModerationCategories: string[];
  aiModerationReason: string | null;
  aiModerationConfidence: number | null;
  aiModeratedAt: string | null;
  // EPIC: Consent Audit Persistence — a durable record of the content-
  // responsibility consent (features/messages/consent.ts), set only by
  // messageRepository.create() with a server-side timestamp. Null/false on
  // any row from before this existed, or from any insert that doesn't
  // present a valid, current-version consent — never backfilled to true.
  consentAccepted: boolean;
  consentVersion: string | null;
  consentAcceptedAt: string | null;
}

export type NewMessageInput = Pick<
  Message,
  | "content"
  | "authorId"
  | "authorName"
  | "isAnonymous"
  | "language"
  | "templateId"
  | "invitationId"
  | "aiModerationStatus"
  | "aiModerationProvider"
  | "aiModerationCategories"
  | "aiModerationReason"
  | "aiModerationConfidence"
  | "aiModeratedAt"
> & {
  /**
   * Raw consent state as the caller believes it — messageRepository.create()
   * independently re-derives whether this actually counts as a valid
   * consent (accepted AND a current-version match) before writing anything,
   * rather than trusting this flag verbatim. See create()'s own comment.
   */
  consentAccepted: boolean;
  consentVersion: string;
};

export const MESSAGE_MAX_LENGTH = 280;
