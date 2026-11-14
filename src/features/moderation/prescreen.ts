import { after } from "next/server";
import { messageRepository, type PrescreenRecord } from "@/features/messages/repository";
import { runModerationAlertsAndRecord } from "./alerts/dueFlag";
import { getModerationService } from "./service";
import type { ModerationService } from "./types";

/**
 * Security pack 2b: the deferred AI pre-screen of a card that was just stored
 * (`prescreenDeferred`). Everything runs after the response (`after`, the
 * Worker's waitUntil): the writer never waits and never sees a failure.
 * Order matters — the pre-screen is recorded first and the moderation alert
 * run comes after it, so the alert's PRIORITY count already includes this card.
 */
export async function runDeferredPrescreen(
  message: { id: string; content: string; language: string },
  deps: {
    moderation?: ModerationService;
    record?: (id: string, result: PrescreenRecord) => Promise<boolean>;
    alerts?: () => Promise<unknown>;
  } = {}
): Promise<void> {
  try {
    const service = deps.moderation ?? getModerationService();
    // The provider never throws (a failure is a "prescreen_unavailable" result).
    const result = await service.analyzeMessage(message.content, { language: message.language });
    await (deps.record ?? ((id, r) => messageRepository.recordPrescreen(id, r)))(message.id, result);
  } catch {
    console.error("[prescreen] could not record the result");
  }
  try {
    await (deps.alerts ?? runModerationAlertsAndRecord)();
  } catch {
    console.error("[moderation-alerts] event run failed");
  }
}

export function schedulePrescreenThenAlert(message: { id: string; content: string; language: string }): void {
  try {
    after(() => runDeferredPrescreen(message));
  } catch {
    // Outside a request scope (scripts, tests): nothing to schedule.
  }
}
