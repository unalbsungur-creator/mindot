/** Security pack 2b: the deferred pre-screen run (./prescreen). Offline, fakes only. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { runDeferredPrescreen } from "./prescreen";
import type { ModerationResult, ModerationService } from "./types";

const RESULT: ModerationResult = {
  decision: "review",
  categories: ["self_harm", "crisis"],
  reason: "r",
  provider: "workers-ai",
  providerVersion: "m",
  confidence: 0.8,
  moderatedAt: "2026-11-14T12:00:00.000Z",
};

describe("runDeferredPrescreen", () => {
  it("records the result first, then runs the alerts (so the PRIORITY count includes this card)", async () => {
    const order: string[] = [];
    const moderation: ModerationService = {
      mode: "deferred",
      async analyzeMessage(content, context) {
        order.push(`analyze:${content}:${context.language}`);
        return RESULT;
      },
    };
    await runDeferredPrescreen(
      { id: "m1", content: "metin", language: "tr" },
      {
        moderation,
        record: async (id, result) => {
          order.push(`record:${id}:${result.decision}`);
          return true;
        },
        alerts: async () => {
          order.push("alerts");
        },
      }
    );
    assert.deepEqual(order, ["analyze:metin:tr", "record:m1:review", "alerts"]);
  });

  it("still runs the alerts when recording fails, and never throws", async () => {
    let alerts = 0;
    await runDeferredPrescreen(
      { id: "m1", content: "x", language: "en" },
      {
        moderation: { async analyzeMessage() { return RESULT; } },
        record: async () => {
          throw new Error("db down");
        },
        alerts: async () => {
          alerts += 1;
          throw new Error("alerts down too");
        },
      }
    );
    assert.equal(alerts, 1);
  });
});
