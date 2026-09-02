import { devFallbackModerationService } from "./providers/devFallback";
import type { ModerationService } from "./types";

/**
 * Provider selection. `AI_MODERATION_PROVIDER` names which one to use;
 * nothing is required to run — the dev fallback is always available and
 * is what runs when the var is unset, which is the case everywhere this
 * project has been run so far (no external AI credentials exist in this
 * environment).
 *
 * To add a real provider: implement `ModerationService` in a new file
 * under `providers/` (see `devFallback.ts` for the shape), branch to it
 * here behind its own env var (e.g. `OPENAI_API_KEY`), and do not remove
 * the dev fallback — it's still what every environment without that
 * provider's credentials should fall back to.
 */
export function getModerationService(): ModerationService {
  const provider = process.env.AI_MODERATION_PROVIDER;

  switch (provider) {
    // Extension point for a real provider, e.g.:
    // case "openai":
    //   return openAiModerationService;
    default:
      return devFallbackModerationService;
  }
}
