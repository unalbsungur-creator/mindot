import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Invitation } from "@/features/invitations/types";
import type { ModerationResult } from "@/features/moderation/types";
import { getNoteTemplate, isTemplateAvailable } from "@/features/notes/config/templates";
import type { User } from "@/features/users/types";
import { CONTENT_CONSENT_VERSION } from "./consent";
import { submitMessageForAuthor, type SubmitMessageDeps, type SubmitMessageParams } from "./service";
import type { Message, NewMessageInput } from "./types";

// Real registry entries: a 150-character card and a stricter 100-character one.
const CARD_150 = "standard-classic";
const CARD_100 = "standard-minimal";

const AI_RESULT: ModerationResult = {
  decision: "review",
  categories: ["contains-link"],
  reason: "heuristic only",
  provider: "test-provider",
  providerVersion: null,
  confidence: 0.4,
  moderatedAt: "2026-10-07T12:00:00.000Z",
};

function invitation(overrides: Partial<Invitation> = {}): Invitation {
  return {
    id: "inv-1",
    token: "tok",
    status: "active",
    recipientEmail: null,
    emailStatus: "not_requested",
    maxUses: 1,
    usedCount: 0,
    createdBy: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    expiresAt: null,
    usedAt: null,
    revokedAt: null,
    ...overrides,
  };
}

interface FakeOptions {
  author?: Pick<User, "id" | "status"> | null;
  recentCount?: number;
  invitation?: Invitation | null;
  aiResult?: ModerationResult;
  moderationThrows?: boolean;
}

function fake(options: FakeOptions = {}) {
  const calls: string[] = [];
  const created: NewMessageInput[] = [];
  const deps: SubmitMessageDeps = {
    users: {
      async getById(id) {
        calls.push("getById");
        const author = options.author === undefined ? { id, status: "active" as const } : options.author;
        return author as User | null;
      },
    },
    messages: {
      async countRecentByAuthor() {
        calls.push("countRecentByAuthor");
        return options.recentCount ?? 0;
      },
      async create(input) {
        calls.push("create");
        created.push(input);
        // The repository stores every new message as "pending" itself.
        return { ...input, id: "msg-1", status: "pending" } as unknown as Message;
      },
    },
    invitations: {
      async getByToken() {
        calls.push("getByToken");
        return options.invitation === undefined ? null : options.invitation;
      },
      async recordUse() {
        calls.push("recordUse");
        return null;
      },
    },
    moderation: () => ({
      async analyzeMessage() {
        calls.push("analyze");
        if (options.moderationThrows) throw new Error("provider down");
        return options.aiResult ?? AI_RESULT;
      },
    }),
  };
  return { deps, calls, created };
}

function params(overrides: Partial<SubmitMessageParams> = {}): SubmitMessageParams {
  return {
    authorId: "user-1",
    fallbackAuthorName: "Session Name",
    content: "A thought worth keeping.",
    templateId: CARD_150,
    fontFamily: "classic",
    authorName: "Typed Name",
    isAnonymous: false,
    language: "tr",
    consentAccepted: true,
    consentVersion: CONTENT_CONSENT_VERSION,
    ...overrides,
  };
}

function assertNoAiOrCreate(calls: string[]) {
  assert.ok(!calls.includes("analyze"), "AI pre-screen must not run");
  assert.ok(!calls.includes("create"), "no message may be created");
}

describe("submitMessageForAuthor — fixtures", () => {
  it("uses real, currently available cards with the expected limits", () => {
    assert.ok(isTemplateAvailable(getNoteTemplate(CARD_150)));
    assert.ok(isTemplateAvailable(getNoteTemplate(CARD_100)));
  });
});

describe("submitMessageForAuthor — refusals (in order)", () => {
  it("refuses a suspended account before anything else", async () => {
    const { deps, calls } = fake({ author: { id: "user-1", status: "suspended" }, recentCount: 99 });
    assert.deepEqual(await submitMessageForAuthor(params({ consentAccepted: false }), deps), {
      ok: false,
      error: "account-suspended",
    });
    assert.deepEqual(calls, ["getById"]);
  });

  it("continues when the author row is missing (unchanged behavior)", async () => {
    const { deps } = fake({ author: null });
    const result = await submitMessageForAuthor(params(), deps);
    assert.equal(result.ok, true);
  });

  it("checks the rate limit before consent", async () => {
    const { deps, calls } = fake({ recentCount: 5 });
    assert.deepEqual(await submitMessageForAuthor(params({ consentAccepted: false }), deps), { ok: false, error: "rate-limited" });
    assertNoAiOrCreate(calls);
  });

  it("allows the fourth and fifth message in the window", async () => {
    const { deps } = fake({ recentCount: 4 });
    assert.equal((await submitMessageForAuthor(params(), deps)).ok, true);
  });

  it("requires consent, and the current consent version", async () => {
    for (const p of [params({ consentAccepted: false }), params({ consentVersion: "0.9" })]) {
      const { deps, calls } = fake();
      assert.deepEqual(await submitMessageForAuthor(p, deps), { ok: false, error: "consent-required" });
      assertNoAiOrCreate(calls);
    }
  });

  it("refuses empty (whitespace-only) content", async () => {
    const { deps, calls } = fake();
    assert.deepEqual(await submitMessageForAuthor(params({ content: "   \n " }), deps), { ok: false, error: "empty-content" });
    assertNoAiOrCreate(calls);
  });

  it("applies the global 150 code-point limit before validating the template", async () => {
    const { deps, calls } = fake();
    const result = await submitMessageForAuthor(params({ content: "a".repeat(151), templateId: "no-such-card" }), deps);
    assert.deepEqual(result, { ok: false, error: "too-long" });
    assertNoAiOrCreate(calls);
  });

  it("counts code points, not UTF-16 units", async () => {
    const { deps } = fake();
    // 150 emoji = 300 UTF-16 units but exactly 150 code points: allowed.
    const result = await submitMessageForAuthor(params({ content: "😀".repeat(150) }), deps);
    assert.equal(result.ok, true);
  });

  it("refuses an unknown template", async () => {
    const { deps, calls } = fake();
    assert.deepEqual(await submitMessageForAuthor(params({ templateId: "no-such-card" }), deps), {
      ok: false,
      error: "invalid-template",
    });
    assertNoAiOrCreate(calls);
  });

  it("applies the card's own, stricter limit after template validation", async () => {
    const { deps, calls } = fake();
    const result = await submitMessageForAuthor(params({ content: "a".repeat(101), templateId: CARD_100 }), deps);
    assert.deepEqual(result, { ok: false, error: "too-long" });
    assertNoAiOrCreate(calls);

    const ok = fake();
    assert.equal((await submitMessageForAuthor(params({ content: "a".repeat(100), templateId: CARD_100 }), ok.deps)).ok, true);
  });

  it("refuses an unknown invitation token", async () => {
    const { deps, calls } = fake({ invitation: null });
    assert.deepEqual(await submitMessageForAuthor(params({ invitationToken: "tok" }), deps), {
      ok: false,
      error: "invitation-invalid",
    });
    assert.ok(!calls.includes("recordUse"));
    assertNoAiOrCreate(calls);
  });

  it("refuses a revoked, used or expired invitation", async () => {
    for (const inv of [
      invitation({ status: "revoked" }),
      invitation({ usedCount: 1, maxUses: 1 }),
      invitation({ expiresAt: "2000-01-01T00:00:00.000Z" }),
    ]) {
      const { deps, calls } = fake({ invitation: inv });
      assert.deepEqual(await submitMessageForAuthor(params({ invitationToken: "tok" }), deps), {
        ok: false,
        error: "invitation-inactive",
      });
      assert.ok(!calls.includes("recordUse"));
      assertNoAiOrCreate(calls);
    }
  });
});

describe("submitMessageForAuthor — accepted submissions", () => {
  it("records a valid invitation's use before creating the message, and links it", async () => {
    const { deps, calls, created } = fake({ invitation: invitation() });
    const result = await submitMessageForAuthor(params({ invitationToken: "tok" }), deps);
    assert.equal(result.ok, true);
    assert.ok(calls.indexOf("recordUse") < calls.indexOf("analyze"));
    assert.ok(calls.indexOf("recordUse") < calls.indexOf("create"));
    assert.equal(created[0].invitationId, "inv-1");
  });

  it("falls back to modern for an unknown or missing font", async () => {
    for (const fontFamily of ["comic-sans", undefined]) {
      const { deps, created } = fake();
      await submitMessageForAuthor(params({ fontFamily }), deps);
      assert.equal(created[0].fontFamily, "modern");
    }
    const { deps, created } = fake();
    await submitMessageForAuthor(params({ fontFamily: "typewriter" }), deps);
    assert.equal(created[0].fontFamily, "typewriter");
  });

  it("discards the typed name for an anonymous note", async () => {
    const { deps, created } = fake();
    await submitMessageForAuthor(params({ isAnonymous: true, authorName: "Real Name" }), deps);
    assert.equal(created[0].authorName, "anonymous");
    assert.equal(created[0].isAnonymous, true);
  });

  it("uses the trimmed typed name, then the fallback name, then anonymous", async () => {
    const typed = fake();
    await submitMessageForAuthor(params({ authorName: "  Typed  " }), typed.deps);
    assert.equal(typed.created[0].authorName, "Typed");

    const fallback = fake();
    await submitMessageForAuthor(params({ authorName: "   " }), fallback.deps);
    assert.equal(fallback.created[0].authorName, "Session Name");

    const none = fake();
    await submitMessageForAuthor(params({ authorName: "", fallbackAuthorName: null }), none.deps);
    assert.equal(none.created[0].authorName, "anonymous");
  });

  it("copies the AI pre-screen result onto the message", async () => {
    const { deps, created } = fake();
    await submitMessageForAuthor(params(), deps);
    assert.equal(created[0].aiModerationStatus, AI_RESULT.decision);
    assert.equal(created[0].aiModerationProvider, AI_RESULT.provider);
    assert.deepEqual(created[0].aiModerationCategories, AI_RESULT.categories);
    assert.equal(created[0].aiModerationReason, AI_RESULT.reason);
    assert.equal(created[0].aiModerationConfidence, AI_RESULT.confidence);
    assert.equal(created[0].aiModeratedAt, AI_RESULT.moderatedAt);
  });

  it("still creates a pending message when the AI says blocked — humans decide", async () => {
    const { deps, created } = fake({ aiResult: { ...AI_RESULT, decision: "blocked" } });
    const result = await submitMessageForAuthor(params(), deps);
    assert.equal(result.ok, true);
    assert.equal(result.ok && result.message.status, "pending");
    assert.equal(created[0].aiModerationStatus, "blocked");
  });

  it("creates nothing if the AI pre-screen itself fails", async () => {
    const { deps, calls } = fake({ moderationThrows: true });
    await assert.rejects(submitMessageForAuthor(params(), deps), /provider down/);
    assert.ok(!calls.includes("create"));
  });

  it("creates a pending message from the trimmed content for the given author", async () => {
    const { deps, calls, created } = fake();
    const result = await submitMessageForAuthor(params({ content: "  Hello there  " }), deps);
    assert.equal(result.ok, true);
    assert.equal(result.ok && result.message.status, "pending");
    assert.deepEqual(calls, ["getById", "countRecentByAuthor", "analyze", "create"]);
    const input = created[0];
    assert.equal(input.content, "Hello there");
    assert.equal(input.authorId, "user-1");
    assert.equal(input.templateId, CARD_150);
    assert.equal(input.language, "tr");
    assert.equal(input.invitationId, null);
    assert.equal(input.consentAccepted, true);
    assert.equal(input.consentVersion, CONTENT_CONSENT_VERSION);
    assert.ok(!("status" in input), "status is set by the repository, never by the caller");
  });

  it("resolves the moderation provider per submission", async () => {
    let resolutions = 0;
    const { deps } = fake();
    const counting: SubmitMessageDeps = {
      ...deps,
      moderation: () => {
        resolutions++;
        return deps.moderation();
      },
    };
    await submitMessageForAuthor(params(), counting);
    await submitMessageForAuthor(params(), counting);
    assert.equal(resolutions, 2);
  });
});
