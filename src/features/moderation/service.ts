import { getCloudflareContext } from "@opennextjs/cloudflare";
import { devFallbackModerationService } from "./providers/devFallback";
import { createWorkersAiModerationService, type WorkersAiBinding } from "./providers/workersAi";
import type { ModerationService } from "./types";

/** The Worker's Workers AI binding (wrangler.jsonc `ai`), or null outside the Worker. */
function workersAiBinding(): WorkersAiBinding | null {
  try {
    return (getCloudflareContext().env as { AI?: WorkersAiBinding }).AI ?? null;
  } catch {
    return null;
  }
}

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
    // Security pack 2b: Cloudflare Workers AI, shadow mode (providers/workersAi.ts).
    case "workers-ai":
      return createWorkersAiModerationService(workersAiBinding);
    default:
      return devFallbackModerationService;
  }
}
