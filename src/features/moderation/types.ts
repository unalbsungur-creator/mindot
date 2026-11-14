export type ModerationDecision = "safe" | "review" | "blocked";

/**
 * A moderation provider's verdict on one message. Advisory only — see
 * "Human moderation authority" in CLAUDE.md. Never expose this to the
 * public board; it exists purely for the admin moderation queue.
 */
export interface ModerationResult {
  decision: ModerationDecision;
  categories: string[];
  reason: string | null;
  provider: string;
  providerVersion: string | null;
  /** 0..1 when the provider reports one; null otherwise — never fabricated. */
  confidence: number | null;
  moderatedAt: string;
}

export interface ModerationContext {
  language: string;
}

/**
 * The provider abstraction. Message submission depends only on this
 * interface, never on a specific vendor — see features/moderation/service.ts
 * for how a provider is selected, and providers/devFallback.ts for the one
 * implementation available without external credentials.
 */
export interface ModerationService {
  /**
   * "inline" (default): analyzed before the message is stored, as part of
   * the submission (the instant dev fallback). "deferred": a slow external
   * model — the message is stored without a result and analyzed after the
   * response (messages/actions.ts), so the writer never waits for it and a
   * failure can't touch the submission.
   */
  mode?: "inline" | "deferred";
  analyzeMessage(content: string, context: ModerationContext): Promise<ModerationResult>;
}
