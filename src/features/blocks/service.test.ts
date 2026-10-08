import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Message, MessageStatus } from "@/features/messages/types";
import type { User } from "@/features/users/types";
import { blockUserAsBlocker, unblockUserAsBlocker, type BlockServiceDeps, type BlockTarget } from "./service";

const BLOCKER = "user-blocker";
const TARGET = "user-target";

interface FakeMessage {
  status: MessageStatus;
  isAnonymous: boolean;
  authorId: string;
}

interface FakeOptions {
  /** publicId → user id */
  publicIds?: Record<string, string>;
  /** messageId → message */
  messages?: Record<string, FakeMessage>;
  inactiveUserIds?: string[];
  blockResult?: "blocked" | "already-blocked";
  unblockResult?: "unblocked" | "not-blocked";
}

function fakeDeps(options: FakeOptions = {}) {
  const calls: string[] = [];
  const blockArgs: [string, string][] = [];
  const unblockArgs: [string, string][] = [];
  const isActiveArgs: string[] = [];
  const deps: BlockServiceDeps = {
    blocks: {
      async block(blockerUserId, blockedUserId) {
        calls.push("block");
        blockArgs.push([blockerUserId, blockedUserId]);
        return options.blockResult ?? "blocked";
      },
      async unblock(blockerUserId, blockedUserId) {
        calls.push("unblock");
        unblockArgs.push([blockerUserId, blockedUserId]);
        return options.unblockResult ?? "unblocked";
      },
    },
    users: {
      async getByPublicId(publicId) {
        calls.push("getByPublicId");
        const id = options.publicIds?.[publicId];
        return id ? ({ id, publicId } as User) : null;
      },
      async isActiveAccount(id) {
        calls.push("isActiveAccount");
        isActiveArgs.push(id);
        return !(options.inactiveUserIds ?? []).includes(id);
      },
      async ensurePublicId(userId) {
        calls.push("ensurePublicId");
        return `pub-of-${userId}`;
      },
    },
    messages: {
      async getById(id) {
        calls.push("getById");
        const message = options.messages?.[id];
        return message ? ({ id, ...message } as Message) : null;
      },
    },
  };
  return { deps, calls, blockArgs, unblockArgs, isActiveArgs };
}

const approvedNamed: FakeMessage = { status: "approved", isAnonymous: false, authorId: TARGET };

describe("blockUserAsBlocker", () => {
  it("blocks by publicId", async () => {
    const { deps, blockArgs } = fakeDeps({ publicIds: { "pub-t": TARGET } });
    const result = await blockUserAsBlocker(BLOCKER, { publicId: "pub-t" }, deps);
    assert.deepEqual(result, { ok: true, status: "blocked", publicId: `pub-of-${TARGET}` });
    assert.deepEqual(blockArgs, [[BLOCKER, TARGET]]);
  });

  it("treats an existing block as ok with already-blocked", async () => {
    const { deps } = fakeDeps({ publicIds: { "pub-t": TARGET }, blockResult: "already-blocked" });
    const result = await blockUserAsBlocker(BLOCKER, { publicId: "pub-t" }, deps);
    assert.deepEqual(result, { ok: true, status: "already-blocked", publicId: `pub-of-${TARGET}` });
  });

  it("blocks the active author of an approved, named message", async () => {
    const { deps, blockArgs, isActiveArgs } = fakeDeps({ messages: { m1: approvedNamed } });
    const result = await blockUserAsBlocker(BLOCKER, { messageId: "m1" }, deps);
    assert.deepEqual(result, { ok: true, status: "blocked", publicId: `pub-of-${TARGET}` });
    assert.deepEqual(isActiveArgs, [TARGET]);
    assert.deepEqual(blockArgs, [[BLOCKER, TARGET]]);
  });

  it("returns not-found for a missing message", async () => {
    const { deps, calls } = fakeDeps();
    const result = await blockUserAsBlocker(BLOCKER, { messageId: "missing" }, deps);
    assert.deepEqual(result, { ok: false, error: "not-found" });
    assert.deepEqual(calls, ["getById"]);
  });

  for (const status of ["pending", "rejected", "archived"] as const) {
    it(`returns not-found for a ${status} message`, async () => {
      const { deps, calls } = fakeDeps({ messages: { m1: { ...approvedNamed, status } } });
      const result = await blockUserAsBlocker(BLOCKER, { messageId: "m1" }, deps);
      assert.deepEqual(result, { ok: false, error: "not-found" });
      assert.deepEqual(calls, ["getById"]);
    });
  }

  it("returns not-found for an anonymous message without probing its author", async () => {
    const { deps, calls } = fakeDeps({ messages: { m1: { ...approvedNamed, isAnonymous: true } } });
    const result = await blockUserAsBlocker(BLOCKER, { messageId: "m1" }, deps);
    assert.deepEqual(result, { ok: false, error: "not-found" });
    assert.deepEqual(calls, ["getById"]);
  });

  it("returns not-found for an inactive author", async () => {
    const { deps, calls } = fakeDeps({ messages: { m1: approvedNamed }, inactiveUserIds: [TARGET] });
    const result = await blockUserAsBlocker(BLOCKER, { messageId: "m1" }, deps);
    assert.deepEqual(result, { ok: false, error: "not-found" });
    assert.deepEqual(calls, ["getById", "isActiveAccount"]);
  });

  it("returns not-found for an unknown publicId without an active-account check", async () => {
    const { deps, calls } = fakeDeps();
    const result = await blockUserAsBlocker(BLOCKER, { publicId: "nobody" }, deps);
    assert.deepEqual(result, { ok: false, error: "not-found" });
    assert.deepEqual(calls, ["getByPublicId"]);
  });

  it("returns not-found for malformed targets without any lookup", async () => {
    const malformed = [null, undefined, "pub-t", 42, {}, { publicId: "" }, { messageId: "" }, { publicId: 7 }, { messageId: ["m1"] }];
    for (const target of malformed) {
      const { deps, calls } = fakeDeps({ publicIds: { "pub-t": TARGET }, messages: { m1: approvedNamed } });
      const result = await blockUserAsBlocker(BLOCKER, target as unknown as BlockTarget, deps);
      assert.deepEqual(result, { ok: false, error: "not-found" }, `target ${JSON.stringify(target)}`);
      assert.deepEqual(calls, [], `target ${JSON.stringify(target)}`);
    }
  });

  it("refuses a self-block by publicId without writing", async () => {
    const { deps, calls } = fakeDeps({ publicIds: { "pub-me": BLOCKER } });
    const result = await blockUserAsBlocker(BLOCKER, { publicId: "pub-me" }, deps);
    assert.deepEqual(result, { ok: false, error: "self-block" });
    assert.deepEqual(calls, ["getByPublicId"]);
  });

  it("refuses a self-block via one's own named message without writing", async () => {
    const { deps, calls } = fakeDeps({ messages: { m1: { ...approvedNamed, authorId: BLOCKER } } });
    const result = await blockUserAsBlocker(BLOCKER, { messageId: "m1" }, deps);
    assert.deepEqual(result, { ok: false, error: "self-block" });
    assert.ok(!calls.includes("block"));
    assert.ok(!calls.includes("ensurePublicId"));
  });

  it("reports not-found rather than self-block when the target doesn't resolve", async () => {
    const { deps } = fakeDeps({ messages: { m1: { ...approvedNamed, authorId: BLOCKER, isAnonymous: true } } });
    const result = await blockUserAsBlocker(BLOCKER, { messageId: "m1" }, deps);
    assert.deepEqual(result, { ok: false, error: "not-found" });
  });

  it("ensures the public id only after the block is written", async () => {
    const { deps, calls } = fakeDeps({ publicIds: { "pub-t": TARGET } });
    await blockUserAsBlocker(BLOCKER, { publicId: "pub-t" }, deps);
    assert.deepEqual(calls, ["getByPublicId", "block", "ensurePublicId"]);
  });
});

describe("unblockUserAsBlocker", () => {
  it("unblocks and returns the input publicId", async () => {
    const { deps, unblockArgs } = fakeDeps({ publicIds: { "pub-t": TARGET } });
    const result = await unblockUserAsBlocker(BLOCKER, { publicId: "pub-t" }, deps);
    assert.deepEqual(result, { ok: true, status: "unblocked", publicId: "pub-t" });
    assert.deepEqual(unblockArgs, [[BLOCKER, TARGET]]);
  });

  it("treats a missing block as ok with not-blocked", async () => {
    const { deps } = fakeDeps({ publicIds: { "pub-t": TARGET }, unblockResult: "not-blocked" });
    const result = await unblockUserAsBlocker(BLOCKER, { publicId: "pub-t" }, deps);
    assert.deepEqual(result, { ok: true, status: "not-blocked", publicId: "pub-t" });
  });

  it("returns not-found without unblocking", async () => {
    const { deps, calls } = fakeDeps();
    const result = await unblockUserAsBlocker(BLOCKER, { publicId: "nobody" }, deps);
    assert.deepEqual(result, { ok: false, error: "not-found" });
    assert.ok(!calls.includes("unblock"));
  });

  it("never ensures a public id", async () => {
    const { deps, calls } = fakeDeps({ publicIds: { "pub-t": TARGET } });
    await unblockUserAsBlocker(BLOCKER, { publicId: "pub-t" }, deps);
    assert.deepEqual(calls, ["getByPublicId", "unblock"]);
  });

  it("has no self check — unblocking oneself returns the repository's result", async () => {
    const { deps, unblockArgs } = fakeDeps({ publicIds: { "pub-me": BLOCKER }, unblockResult: "not-blocked" });
    const result = await unblockUserAsBlocker(BLOCKER, { publicId: "pub-me" }, deps);
    assert.deepEqual(result, { ok: true, status: "not-blocked", publicId: "pub-me" });
    assert.deepEqual(unblockArgs, [[BLOCKER, BLOCKER]]);
  });

  it("keeps the shared resolver's runtime behavior for a { messageId } target", async () => {
    const { deps, unblockArgs } = fakeDeps({ messages: { m1: approvedNamed } });
    const target = { messageId: "m1" } as unknown as { publicId: string };
    const result = await unblockUserAsBlocker(BLOCKER, target, deps);
    assert.deepEqual(result, { ok: true, status: "unblocked", publicId: undefined });
    assert.deepEqual(unblockArgs, [[BLOCKER, TARGET]]);

    const anonymous = fakeDeps({ messages: { m1: { ...approvedNamed, isAnonymous: true } } });
    const anonymousResult = await unblockUserAsBlocker(BLOCKER, target, anonymous.deps);
    assert.deepEqual(anonymousResult, { ok: false, error: "not-found" });
    assert.deepEqual(anonymous.calls, ["getById"]);
  });
});
