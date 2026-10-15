import assert from "node:assert/strict";
import { before, beforeEach, describe, it, mock } from "node:test";
import type { Message } from "@/features/messages/types";
import { PUBLIC_WALL_CONSENT_VERSION } from "@/features/profile/lib/wallConsent";
import type { User } from "@/features/users/types";

// The wall share image route: the newest eligible cards drawn by the V2
// renderer, behind the same gate as the wall page, falling back to the
// plain-card renderer if V2 fails — while the wall's OG image keeps the old
// renderer and the old read. Real route, real profile repository, real OG
// module; mocked repositories and renderers. Run: npm run test:wall-share

const PUBLIC_ID = "pub123";
let owner: User | null;
const calls = {
  newest: [] as Array<[string, number]>,
  oldest: 0,
  v2: [] as Array<{ notes: unknown[]; format: { id: string }; displayName: string }>,
  plain: [] as Array<{ notes: unknown[]; format: { id: string } }>,
  brand: 0,
};
let v2Mode: "ok" | "throws" | "fails-while-rendering";
let plainThrows: boolean;

const message = (i: number): Message =>
  ({
    id: `m${i}`,
    content: `note ${i}`,
    templateId: i % 2 ? "polaroid" : "celebration-spark",
    fontFamily: "handwritten",
    textAlign: i % 3 ? "center" : "auto",
    rotation: 0,
    language: "tr",
    createdAt: new Date(Date.UTC(2026, 9, 14) - i * 60_000).toISOString(),
  }) as unknown as Message;

const makeOwner = (fields: Partial<User> = {}): User =>
  ({
    id: "owner-1",
    name: "Ayşe",
    image: null,
    publicId: PUBLIC_ID,
    publicWallEnabled: true,
    publicWallDescription: null,
    publicWallConsentVersion: PUBLIC_WALL_CONSENT_VERSION,
    publicWallConsentAt: "2026-10-14T00:00:00.000Z",
    ...fields,
  }) as User;

let GET: typeof import("@/app/api/share/wall/[publicId]/[formatId]/route").GET;
let ogImage: typeof import("@/app/u/[publicId]/opengraph-image").default;

before(async () => {
  mock.module("@/features/users/repository", {
    namedExports: { userRepository: { getByPublicId: async (id: string) => (id === PUBLIC_ID ? owner : null) } },
  });
  mock.module("@/features/messages/repository", {
    namedExports: {
      messageRepository: {
        listNewestPublicByAuthor: async (authorId: string, limit: number) => (calls.newest.push([authorId, limit]), Array.from({ length: limit }, (_, i) => message(i))),
        listPublicByAuthor: async () => (calls.oldest++, Array.from({ length: 6 }, (_, i) => message(100 + i))),
        countPublicByAuthorInRange: async () => 6,
      },
    },
  });
  mock.module("@/features/blocks/repository", { namedExports: { blockRepository: { isBlocked: async () => false } } });
  mock.module("@/features/board/repository", { namedExports: { getPublicMessageById: async () => null } });
  mock.module("@/features/memories/repository", {
    namedExports: { memoryRepository: {}, digitalAccessCodeRepository: {}, memoryPdfUnlockRepository: {}, physicalOrderRepository: {} },
  });
  mock.module("@/features/sharing/services/shareCardRenderer", {
    namedExports: {
      renderWallShareCardV2: async (input: (typeof calls.v2)[number]) => {
        calls.v2.push(input);
        if (v2Mode === "throws") throw new Error("v2 failed");
        if (v2Mode === "fails-while-rendering") return { headers: new Headers({ "content-type": "image/png" }), arrayBuffer: async () => Promise.reject(new Error("render failed mid-stream")) };
        return new Response("v2-png", { headers: { "content-type": "image/png", "cache-control": "public, immutable, no-transform, max-age=31536000" } });
      },
      renderWallShareCard: async (input: (typeof calls.plain)[number]) => {
        calls.plain.push(input);
        if (plainThrows) throw new Error("plain failed");
        return new Response("plain-png", { headers: { "content-type": "image/png" } });
      },
    },
  });
  mock.module("@/features/sharing/services/brandOgImage", {
    namedExports: { OG_IMAGE_SIZE: { width: 1200, height: 630 }, renderBrandOgImage: async () => (calls.brand++, new Response("brand")) },
  });

  ({ GET } = await import("@/app/api/share/wall/[publicId]/[formatId]/route"));
  ({ default: ogImage } = await import("@/app/u/[publicId]/opengraph-image"));
});

beforeEach(() => {
  owner = makeOwner();
  v2Mode = "ok";
  plainThrows = false;
  calls.newest = [];
  calls.oldest = 0;
  calls.v2 = [];
  calls.plain = [];
  calls.brand = 0;
});

const request = (publicId: string, formatId: string) =>
  GET({ url: `http://localhost/api/share/wall/${publicId}/${formatId}` } as never, { params: Promise.resolve({ publicId, formatId }) });

describe("wall share image route", () => {
  it("draws the newest 4 cards on a square and 8 on a story with the V2 renderer", async () => {
    for (const [formatId, limit] of [["square", 4], ["story", 8]] as const) {
      calls.newest = [];
      calls.v2 = [];
      const response = await request(PUBLIC_ID, formatId);
      assert.equal(response.status, 200);
      assert.equal(await response.text(), "v2-png");
      assert.deepEqual(calls.newest, [["owner-1", limit]], `${formatId}: newest ${limit}, not the oldest-first wall read`);
      assert.equal(calls.oldest, 0);
      assert.equal(calls.v2[0].format.id, formatId);
      assert.equal(calls.v2[0].displayName, "Ayşe");
      assert.deepEqual(calls.v2[0].notes.map((n) => (n as { content: string }).content), Array.from({ length: limit }, (_, i) => `note ${i}`), "newest first, in order");
      assert.deepEqual(calls.v2[0].notes[1], { id: "m1", content: "note 1", templateId: "polaroid", fontFamily: "handwritten", textAlign: "center", rotation: 0, language: "tr", createdAt: message(1).createdAt }, "the card's typeface and alignment reach the renderer");
    }
    assert.deepEqual(calls.plain, []);
  });

  it("keeps the wall image's 5-minute cache, not ImageResponse's default", async () => {
    const response = await request(PUBLIC_ID, "square");
    assert.equal(response.headers.get("cache-control"), "public, max-age=300, stale-while-revalidate=3600");
    assert.equal(response.headers.get("content-type"), "image/png");
  });

  it("falls back to the plain-card image when V2 throws", async () => {
    v2Mode = "throws";
    const response = await request(PUBLIC_ID, "story");
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "plain-png");
    assert.equal(calls.plain.length, 1);
    assert.deepEqual(calls.plain[0].notes, Array.from({ length: 8 }, (_, i) => ({ content: `note ${i}`, templateId: message(i).templateId })));
    assert.equal(response.headers.get("cache-control"), "public, max-age=300, stale-while-revalidate=3600");
  });

  it("falls back when V2 fails while rendering (it is buffered, not streamed)", async () => {
    v2Mode = "fails-while-rendering";
    const response = await request(PUBLIC_ID, "square");
    assert.equal(await response.text(), "plain-png");
  });

  it("answers 500 only when both renderers fail", async () => {
    v2Mode = "throws";
    plainThrows = true;
    const response = await request(PUBLIC_ID, "square");
    assert.equal(response.status, 500);
  });

  it("keeps the gate: a wall without current consent, a turned-off wall and an unknown one are 404 with no card read", async () => {
    for (const fields of [{ publicWallConsentVersion: null, publicWallConsentAt: null }, { publicWallConsentVersion: "0.9" }, { publicWallEnabled: false }]) {
      owner = makeOwner(fields);
      assert.equal((await request(PUBLIC_ID, "square")).status, 404, JSON.stringify(fields));
    }
    assert.equal((await request("unknown", "square")).status, 404);
    assert.deepEqual(calls.newest, []);
    assert.deepEqual(calls.v2, []);
  });

  it("refuses the print master before any lookup", async () => {
    const response = await request(PUBLIC_ID, "print");
    assert.equal(response.status, 404);
    assert.deepEqual(calls.newest, []);
  });
});

describe("wall Open Graph image", () => {
  it("keeps the old renderer and the old read", async () => {
    await ogImage({ params: Promise.resolve({ publicId: PUBLIC_ID }) });
    assert.equal(calls.oldest, 1, "oldest-first wall read, as before");
    assert.deepEqual(calls.newest, []);
    assert.equal(calls.plain.length, 1);
    assert.equal(calls.plain[0].format.id, "og");
    assert.equal(calls.plain[0].notes.length, 4);
    assert.deepEqual(calls.v2, []);
  });

  it("still falls back to the brand image for a wall without current consent", async () => {
    owner = makeOwner({ publicWallConsentVersion: null, publicWallConsentAt: null });
    await ogImage({ params: Promise.resolve({ publicId: PUBLIC_ID }) });
    assert.equal(calls.brand, 1);
    assert.deepEqual(calls.plain, []);
  });
});
