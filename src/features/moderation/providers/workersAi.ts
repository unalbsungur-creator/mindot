import { CRISIS_CATEGORY, PRESCREEN_UNAVAILABLE } from "../lib/prescreenFlags";
import type { ModerationDecision, ModerationResult, ModerationService } from "../types";

export { CRISIS_CATEGORY, PRESCREEN_UNAVAILABLE };
import { buildUserMessage, PRESCREEN_CATEGORIES, RESPONSE_SCHEMA, SYSTEM_PROMPT, type PrescreenCategory } from "./workersAiPrompt";

/**
 * Security pack 2b, item 5 — the AI pre-screen on Cloudflare Workers AI
 * (Cloudflare's own inference; no other AI vendor, no API key). SHADOW MODE:
 * the result is only stored on the message and shown on the admin moderation
 * card; it never approves, rejects or hides anything, and every card still
 * waits for a human (see "Human moderation authority" in CLAUDE.md).
 *
 * - Model: Gemma 4 26B-A4B instruct — multilingual (TR/EN/DE/FR/ES), JSON
 *   schema output, reasoning off (short, cheap, fast).
 * - Runs after the response (messages/actions.ts), never in the writer's path.
 * - Never throws: a timeout, an error or an answer outside the schema becomes
 *   a `review` result with the {@link PRESCREEN_UNAVAILABLE} category
 *   ("pre-screen could not run"), so a failure can't pass for a clean bill.
 * - `crisis` (possible self-harm / suicide risk) is stored as the
 *   {@link CRISIS_CATEGORY} category: the queue sorts such cards first as
 *   PRIORITY and the alert e-mail states only how many there are.
 */

export const WORKERS_AI_MODEL = "@cf/google/gemma-4-26b-a4b-it";
export const WORKERS_AI_PROVIDER = "workers-ai";
export const PRESCREEN_TIMEOUT_MS = 12_000;


/** The part of the Workers AI binding this provider uses. */
export interface WorkersAiBinding {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
}

const DECISIONS: readonly ModerationDecision[] = ["safe", "review", "blocked"];

function unavailable(reason: "timeout" | "error" | "invalid-response", now: Date): ModerationResult {
  return {
    decision: "review",
    categories: [PRESCREEN_UNAVAILABLE],
    reason: `Pre-screen could not run (${reason}).`,
    provider: WORKERS_AI_PROVIDER,
    providerVersion: WORKERS_AI_MODEL,
    confidence: null,
    moderatedAt: now.toISOString(),
  };
}

/** Extracts the model's JSON answer from a Workers AI chat response (OpenAI-style or legacy `response`). */
function answerText(output: unknown): unknown {
  if (!output || typeof output !== "object") return null;
  const o = output as { choices?: { message?: { content?: unknown } }[]; response?: unknown };
  return o.choices?.[0]?.message?.content ?? o.response ?? null;
}

/** Validates the model's answer against the contract; `null` if it doesn't hold. Pure — unit-tested. */
export function parsePrescreenAnswer(raw: unknown, now: Date): ModerationResult | null {
  let value: unknown = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.decision !== "string" || !DECISIONS.includes(v.decision as ModerationDecision)) return null;
  if (!Array.isArray(v.categories) || typeof v.crisis !== "boolean") return null;

  const categories = new Set<string>(
    v.categories.filter((c): c is PrescreenCategory => typeof c === "string" && (PRESCREEN_CATEGORIES as readonly string[]).includes(c))
  );
  let decision = v.decision as ModerationDecision;
  if (v.crisis) {
    categories.add("self_harm");
    categories.add(CRISIS_CATEGORY);
    // A possible crisis is never "safe", whatever else the model said.
    if (decision === "safe") decision = "review";
  }
  const confidence =
    typeof v.confidence === "number" && Number.isFinite(v.confidence) ? Math.min(Math.max(v.confidence, 0), 1) : null;
  const reason = typeof v.reason === "string" && v.reason.trim() ? v.reason.trim().replace(/\s+/g, " ").slice(0, 200) : null;

  return {
    decision,
    categories: [...categories],
    reason,
    provider: WORKERS_AI_PROVIDER,
    providerVersion: WORKERS_AI_MODEL,
    confidence,
    moderatedAt: now.toISOString(),
  };
}

export function createWorkersAiModerationService(
  getBinding: () => WorkersAiBinding | null,
  options: { timeoutMs?: number; now?: () => Date } = {}
): ModerationService {
  const timeoutMs = options.timeoutMs ?? PRESCREEN_TIMEOUT_MS;
  const now = options.now ?? (() => new Date());
  return {
    mode: "deferred",
    async analyzeMessage(content, context) {
      let ai: WorkersAiBinding | null = null;
      try {
        ai = getBinding();
      } catch {
        ai = null;
      }
      if (!ai) return unavailable("error", now());

      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), timeoutMs);
      });
      try {
        const output = await Promise.race([
          ai.run(WORKERS_AI_MODEL, {
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: buildUserMessage(content, context.language) },
            ],
            response_format: { type: "json_schema", json_schema: { name: "prescreen", schema: RESPONSE_SCHEMA, strict: true } },
            chat_template_kwargs: { enable_thinking: false },
            temperature: 0,
            max_tokens: 200,
          }),
          timeout,
        ]);
        if (output === "timeout") {
          console.warn("[prescreen] timed out");
          return unavailable("timeout", now());
        }
        const parsed = parsePrescreenAnswer(answerText(output), now());
        if (!parsed) {
          console.warn("[prescreen] answer outside the schema");
          return unavailable("invalid-response", now());
        }
        return parsed;
      } catch (error) {
        console.warn(`[prescreen] failed: ${error instanceof Error ? error.name : "unknown"}`);
        return unavailable("error", now());
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
  };
}
