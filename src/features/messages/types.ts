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
  // AI pre-screen, recorded at submission time. Advisory only — never
  // publishes or rejects on its own. Null on rows from before this existed.
  aiModerationStatus: AiModerationDecision | null;
  aiModerationProvider: string | null;
  aiModerationCategories: string[];
  aiModerationReason: string | null;
  aiModerationConfidence: number | null;
  aiModeratedAt: string | null;
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
>;

export const MESSAGE_MAX_LENGTH = 280;
