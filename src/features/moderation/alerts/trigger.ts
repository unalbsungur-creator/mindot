import { after } from "next/server";
import { runModerationAlertsAndRecord } from "./dueFlag";

/**
 * MN-01: the event trigger. Called when content reaches the review queue —
 * a new card (`submitMessage`) or an edit request (`submitMessageRevision`) —
 * right after it is stored. The alert run happens after the response
 * (`after`, the Worker's waitUntil), so the writer never waits for it and
 * can never see it fail: the run itself never throws, and any error here is
 * swallowed. With the queue empty before this submission, this run starts
 * the cycle and sends the first alert at once.
 */
export function scheduleModerationAlert(): void {
  try {
    after(async () => {
      try {
        await runModerationAlertsAndRecord();
      } catch {
        console.error("[moderation-alerts] event run failed");
      }
    });
  } catch {
    // Outside a request scope (scripts, tests): no alert, and no effect on the caller.
  }
}
