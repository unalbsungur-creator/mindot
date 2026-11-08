import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Message, MessageStatus } from "@/features/messages/types";
import { HOME_FIXED_MESSAGE_IDS } from "./fixedMessages";
import { selectHomeHeroMessages } from "./heroSelection";

const MERHABA = "287bddad-ce94-4eca-8127-4f0d95776434";

const msg = (id: string, status: MessageStatus = "approved") => ({ id, status }) as Message;

/**
 * A fake repository: `stored` is what getById finds (absent = deleted),
 * `liked`/`newest` are the approved cards each query would return, in order —
 * both honour the exclusion list like the real SQL does.
 */
function repo({ stored = {}, liked = [], newest = [] }: { stored?: Record<string, MessageStatus>; liked?: string[]; newest?: string[] }) {
  const calls: { method: string; exclude?: string[]; limit?: number; id?: string }[] = [];
  return {
    calls,
    deps: {
      async getById(id: string) {
        calls.push({ method: "getById", id });
        return id in stored ? msg(id, stored[id]) : null;
      },
      async listTopLikedApproved(exclude: string[], limit: number) {
        calls.push({ method: "liked", exclude, limit });
        return liked.filter((id) => !exclude.includes(id)).slice(0, limit).map((id) => msg(id));
      },
      async listNewestApproved(exclude: string[], limit: number) {
        calls.push({ method: "newest", exclude, limit });
        return newest.filter((id) => !exclude.includes(id)).slice(0, limit).map((id) => msg(id));
      },
    },
  };
}

const ids = (result: { messages: Message[] }) => result.messages.map((m) => m.id);

describe("HOME_FIXED_MESSAGE_IDS", () => {
  it("pins exactly one card: “Merhaba Dünya”", () => {
    assert.deepEqual([...HOME_FIXED_MESSAGE_IDS], [MERHABA]);
  });
});

describe("selectHomeHeroMessages — the pinned card", () => {
  it("takes the first place, and the rule fills the other three with the most liked", async () => {
    const { deps, calls } = repo({ stored: { [MERHABA]: "approved" }, liked: ["a", "b", "c", "d"] });
    const result = await selectHomeHeroMessages(deps, [MERHABA]);
    assert.deepEqual(ids(result), [MERHABA, "a", "b", "c"]);
    assert.deepEqual(result.pinnedIds, [MERHABA]);
    assert.equal(result.mode, "top-liked");
    assert.deepEqual(calls.find((c) => c.method === "liked"), { method: "liked", exclude: [MERHABA], limit: 3 });
  });

  it("is never shown twice when the rule would pick it too", async () => {
    // "Merhaba Dünya" is itself among the most liked and the newest.
    const { deps } = repo({ stored: { [MERHABA]: "approved" }, liked: [MERHABA, "a"], newest: [MERHABA, "x", "y"] });
    const result = await selectHomeHeroMessages(deps, [MERHABA]);
    assert.deepEqual(ids(result), [MERHABA, "a", "x", "y"]);
    assert.equal(new Set(ids(result)).size, 4);
    assert.equal(result.mode, "latest");
  });

  it("de-duplicates even if a query ignored the exclusion list", async () => {
    const leaky = {
      async getById(id: string) {
        return msg(id);
      },
      async listTopLikedApproved() {
        return [msg(MERHABA), msg("a"), msg("b")];
      },
      async listNewestApproved() {
        return [msg("a"), msg("z")];
      },
    };
    const result = await selectHomeHeroMessages(leaky, [MERHABA]);
    assert.deepEqual(ids(result), [MERHABA, "a", "b"]);
  });

  for (const [label, stored] of [
    ["archived (yayından kaldırıldı)", { [MERHABA]: "archived" as const }],
    ["rejected", { [MERHABA]: "rejected" as const }],
    ["still pending", { [MERHABA]: "pending" as const }],
    ["deleted (no row at all)", {}],
  ] as const) {
    it(`gives its place to the rule when it is ${label} — no error, no gap`, async () => {
      const { deps } = repo({ stored, liked: ["a", "b", "c", "d"] });
      const result = await selectHomeHeroMessages(deps, [MERHABA]);
      assert.deepEqual(ids(result), ["a", "b", "c", "d"]);
      assert.deepEqual(result.pinnedIds, []);
      assert.equal(result.mode, "top-liked");
    });
  }

  it("uses the real pinned list by default", async () => {
    const { deps, calls } = repo({ stored: { [MERHABA]: "approved" }, newest: ["x", "y", "z"] });
    const result = await selectHomeHeroMessages(deps);
    assert.deepEqual(ids(result), [MERHABA, "x", "y", "z"]);
    assert.deepEqual(calls.filter((c) => c.method === "getById").map((c) => c.id), [MERHABA]);
  });
});

describe("selectHomeHeroMessages — the rule without a pinned card", () => {
  it("shows the 4 most liked as “most liked” when 4 have likes", async () => {
    const { deps, calls } = repo({ liked: ["a", "b", "c", "d", "e"], newest: ["z"] });
    const result = await selectHomeHeroMessages(deps, []);
    assert.equal(result.mode, "top-liked");
    assert.deepEqual(ids(result), ["a", "b", "c", "d"]);
    assert.ok(!calls.some((c) => c.method === "newest"), "no fill-up query");
  });

  it("puts the liked ones first and fills up with the newest as “latest”", async () => {
    const { deps, calls } = repo({ liked: ["a", "b"], newest: ["b", "x", "y", "z"] });
    const result = await selectHomeHeroMessages(deps, []);
    assert.equal(result.mode, "latest");
    assert.deepEqual(ids(result), ["a", "b", "x", "y"]);
    assert.deepEqual(calls.find((c) => c.method === "newest"), { method: "newest", exclude: ["a", "b"], limit: 2 });
  });

  it("returns fewer than 4 when the Wall has fewer, and nothing for an empty Wall", async () => {
    assert.deepEqual(ids(await selectHomeHeroMessages(repo({ newest: ["x", "y"] }).deps, [])), ["x", "y"]);
    const empty = await selectHomeHeroMessages(repo({}).deps, [MERHABA]);
    assert.deepEqual([empty.mode, empty.messages.length], ["latest", 0]);
  });
});
