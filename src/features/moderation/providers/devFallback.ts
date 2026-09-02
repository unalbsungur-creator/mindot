import type { ModerationResult, ModerationService } from "../types";

/**
 * The development-safe default: no external AI credentials are configured
 * anywhere in this project, so this is what runs. It does NOT pretend to
 * understand content — its provider name and reason text always say so
 * plainly, and its default verdict for ordinary text is "review", not
 * "safe", because a lightweight heuristic genuinely cannot tell the
 * difference. It only reaches for "blocked" on mechanically obvious spam
 * patterns (no content understanding required), and "safe" is never
 * returned at all — that determination needs real analysis this provider
 * doesn't have. See features/moderation/service.ts for how a real provider
 * (OpenAI, Anthropic, a rules service, etc.) would replace this.
 */
export const PROVIDER_NAME = "dev-fallback";

const URL_PATTERN = /https?:\/\/|www\./i;
const REPEATED_CHAR_PATTERN = /(.)\1{7,}/; // the same character 8+ times in a row

function hasExcessiveShouting(content: string): boolean {
  const letters = content.replace(/[^\p{L}]/gu, "");
  if (letters.length < 20) return false;
  const upper = letters.replace(/[^\p{Lu}]/gu, "");
  return upper.length / letters.length > 0.85;
}

class DevFallbackModerationService implements ModerationService {
  async analyzeMessage(content: string): Promise<ModerationResult> {
    const categories: string[] = [];

    if (REPEATED_CHAR_PATTERN.test(content)) {
      categories.push("repeated-characters");
      return this.result("blocked", categories, "Repeated-character pattern typical of spam.");
    }

    if (URL_PATTERN.test(content)) categories.push("contains-link");
    if (hasExcessiveShouting(content)) categories.push("all-caps");

    // Deliberately never "safe": a heuristic without real content
    // understanding has no basis to clear a message on its own merits.
    return this.result(
      "review",
      categories,
      "No AI moderation provider is configured — this is a lightweight heuristic check, not content analysis. An admin should read this message directly."
    );
  }

  private result(decision: ModerationResult["decision"], categories: string[], reason: string): ModerationResult {
    return {
      decision,
      categories,
      reason,
      provider: PROVIDER_NAME,
      providerVersion: null,
      confidence: null,
      moderatedAt: new Date().toISOString(),
    };
  }
}

export const devFallbackModerationService: ModerationService = new DevFallbackModerationService();
