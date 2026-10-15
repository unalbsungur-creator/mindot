import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, beforeEach, describe, it, mock } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { User } from "@/features/users/types";
import { defaultLocale, locales } from "@/i18n/config";
import { LocaleProvider } from "@/i18n/LocaleProvider";
import { getDictionary } from "@/i18n/translations";
import { PUBLIC_WALL_CONSENT_VERSION, type WallVisibilityState } from "./lib/wallConsent";

// The public wall's explicit consent (migration 0025): the server action is
// the boundary, and getPublicWall's one rule closes the wall page, its
// metadata, the wall share image and its OG image together. Against mocked
// server modules only (no database). Run with module mocks:
//   npm run test:wall-consent

const OWNER_ID = "owner-1";
const PUBLIC_ID = "pub123";

let session: { user: { id: string; role: "user" } } | null;
let owner: User;
const calls = {
  enable: [] as Array<[string, string]>,
  disable: [] as string[],
  messageQueries: 0,
  wallImages: 0,
  brandImages: 0,
};

const makeOwner = (fields: Partial<User>): User =>
  ({
    id: OWNER_ID,
    email: "owner@example.test",
    name: "Ayşe",
    image: null,
    role: "user",
    publicId: PUBLIC_ID,
    publicWallEnabled: true,
    publicWallDescription: null,
    publicWallConsentVersion: PUBLIC_WALL_CONSENT_VERSION,
    publicWallConsentAt: "2026-10-14T00:00:00.000Z",
    status: "active",
    statusReason: null,
    statusChangedAt: null,
    statusChangedBy: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...fields,
  }) as User;

const wallNote = {
  id: "note-1",
  content: "Bugün denize baktım.",
  templateId: "classic-yellow",
  fontFamily: "modern",
  textAlign: "auto",
  showOnPersonalWall: true,
  rotation: 0,
  language: "tr",
  createdAt: new Date("2026-10-14T00:00:00.000Z"),
};

let setWallVisibility: typeof import("./actions").setWallVisibility;
let getPublicWall: typeof import("./repository").getPublicWall;
let wallImageGET: typeof import("@/app/api/share/wall/[publicId]/[formatId]/route").GET;
let wallOgImage: typeof import("@/app/u/[publicId]/opengraph-image").default;
let wallMetadata: typeof import("@/app/u/[publicId]/page").generateMetadata;
let WallSettings: typeof import("@/app/me/_components/WallSettings").WallSettings;

before(async () => {
  mock.module("@/features/auth/auth", {
    namedExports: { auth: async () => session, signIn: async () => {}, signOut: async () => {} },
  });
  mock.module("next/cache", { namedExports: { revalidatePath: () => {} } });
  mock.module("@/features/users/repository", {
    namedExports: {
      userRepository: {
        getByPublicId: async (publicId: string) => (publicId === PUBLIC_ID ? owner : null),
        getById: async () => null,
        enablePublicWallWithConsent: async (userId: string, version: string) => (calls.enable.push([userId, version]), owner),
        disablePublicWall: async (userId: string) => (calls.disable.push(userId), owner),
        setPublicWallDescription: async () => owner,
      },
    },
  });
  mock.module("@/features/messages/repository", {
    namedExports: {
      messageRepository: {
        listPublicByAuthor: async () => (calls.messageQueries++, [wallNote]),
        // The wall share image's read (its newest cards) — a message query like the wall page's.
        listNewestPublicByAuthor: async () => (calls.messageQueries++, [wallNote]),
        countPublicByAuthorInRange: async () => (calls.messageQueries++, 1),
      },
    },
  });
  mock.module("@/features/messages/service", { namedExports: { submitMessageRevisionForAuthor: async () => ({ ok: false }) } });
  mock.module("@/features/blocks/repository", { namedExports: { blockRepository: { isBlocked: async () => false } } });
  mock.module("@/features/blocks/actions", { namedExports: { blockUser: async () => ({ ok: true }), unblockUser: async () => ({ ok: true }) } });
  mock.module("@/features/board/repository", { namedExports: { getPublicMessageById: async () => null } });
  mock.module("@/features/memories/repository", {
    namedExports: { memoryRepository: {}, digitalAccessCodeRepository: {}, memoryPdfUnlockRepository: {}, physicalOrderRepository: {} },
  });
  mock.module("@/features/sharing/services/shareCardRenderer", {
    namedExports: {
      renderWallShareCard: async () => (calls.wallImages++, new Response("wall")),
      // The wall share route's real-card renderer; the OG image never uses it.
      renderWallShareCardV2: async () => new Response("wall-v2"),
    },
  });
  mock.module("@/features/sharing/services/brandOgImage", {
    namedExports: { OG_IMAGE_SIZE: { width: 1200, height: 630 }, renderBrandOgImage: async () => (calls.brandImages++, new Response("brand")) },
  });
  mock.module("next/navigation", { namedExports: { useSearchParams: () => new URLSearchParams() } });

  ({ setWallVisibility } = await import("./actions"));
  ({ getPublicWall } = await import("./repository"));
  ({ GET: wallImageGET } = await import("@/app/api/share/wall/[publicId]/[formatId]/route"));
  ({ default: wallOgImage } = await import("@/app/u/[publicId]/opengraph-image"));
  ({ generateMetadata: wallMetadata } = await import("@/app/u/[publicId]/page"));
  ({ WallSettings } = await import("@/app/me/_components/WallSettings"));
});

beforeEach(() => {
  session = { user: { id: OWNER_ID, role: "user" } };
  owner = makeOwner({});
  calls.enable = [];
  calls.disable = [];
  calls.messageQueries = 0;
  calls.wallImages = 0;
  calls.brandImages = 0;
});

describe("setWallVisibility", () => {
  it("refuses to turn the wall on without the current consent version — nothing is written", async () => {
    for (const version of [undefined, "", "0.9", "1", ` ${PUBLIC_WALL_CONSENT_VERSION}`]) {
      assert.deepEqual(await setWallVisibility(true, version), { ok: false, error: "consent-required" }, String(version));
    }
    assert.deepEqual(calls.enable, []);
    assert.deepEqual(calls.disable, []);
  });

  it("refuses a signed-out caller before anything else", async () => {
    session = null;
    assert.deepEqual(await setWallVisibility(true, PUBLIC_WALL_CONSENT_VERSION), { ok: false, error: "auth-required" });
    assert.deepEqual(await setWallVisibility(false), { ok: false, error: "auth-required" });
    assert.deepEqual([calls.enable, calls.disable], [[], []]);
  });

  it("turns the wall on for the session's own account with the server's version", async () => {
    assert.deepEqual(await setWallVisibility(true, PUBLIC_WALL_CONSENT_VERSION), { ok: true });
    assert.deepEqual(calls.enable, [[OWNER_ID, PUBLIC_WALL_CONSENT_VERSION]]);
  });

  it("turns the wall off without asking for consent", async () => {
    assert.deepEqual(await setWallVisibility(false), { ok: true });
    assert.deepEqual(calls.disable, [OWNER_ID]);
    assert.deepEqual(calls.enable, []);
  });

  it("never turns the wall on for anything but a literal true", async () => {
    await setWallVisibility("true" as unknown as boolean, PUBLIC_WALL_CONSENT_VERSION);
    assert.deepEqual(calls.enable, []);
  });
});

describe("one visibility rule for the wall and everything built from it", () => {
  const cases: Array<[string, Partial<User>, boolean]> = [
    ["current consent", {}, true],
    ["turned on before consent existed", { publicWallConsentVersion: null, publicWallConsentAt: null }, false],
    ["consented under an older version", { publicWallConsentVersion: "0.9" }, false],
    ["turned off (consent kept)", { publicWallEnabled: false }, false],
  ];

  for (const [name, fields, isPublic] of cases) {
    it(`${name}: ${isPublic ? "public" : "closed"} everywhere`, async () => {
      owner = makeOwner(fields);

      const wall = await getPublicWall(PUBLIC_ID);
      assert.equal(wall.status, isPublic ? "ok" : "disabled", "getPublicWall");
      if (!isPublic) assert.equal(calls.messageQueries, 0, "a closed wall never queries its notes");

      const image = await wallImageGET({ url: `http://localhost/api/share/wall/${PUBLIC_ID}/square` } as never, {
        params: Promise.resolve({ publicId: PUBLIC_ID, formatId: "square" }),
      });
      assert.equal(image.status, isPublic ? 200 : 404, "wall share image");

      calls.wallImages = 0;
      await wallOgImage({ params: Promise.resolve({ publicId: PUBLIC_ID }) });
      assert.deepEqual([calls.wallImages, calls.brandImages], isPublic ? [1, 0] : [0, 1], "OG image");

      const metadata = await wallMetadata({ params: Promise.resolve({ publicId: PUBLIC_ID }) } as never);
      if (isPublic) assert.equal(metadata.title, "Ayşe");
      else assert.deepEqual([metadata.title, metadata.robots], ["MINDOT", { index: false, follow: true }], "metadata");
    });
  }
});

describe("/me wall switch", () => {
  const t = getDictionary(defaultLocale).profile;
  const escapeHtml = (text: string) =>
    text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
  const render = (initialState: WallVisibilityState) =>
    renderToStaticMarkup(
      <LocaleProvider>
        <WallSettings initialState={initialState} initialDescription={null} onStateChange={() => {}} />
      </LocaleProvider>
    );
  const switchTag = (html: string) => /<button[^>]*role="switch"[^>]*>/.exec(html)?.[0] ?? "";

  it("shows a public wall as on", () => {
    const html = render("public");
    assert.match(switchTag(html), /aria-checked="true"/);
    assert.ok(!html.includes(escapeHtml(t.wallConsentRequiredNotice)));
  });

  it("shows a wall waiting for consent as off, with the notice and a way back", () => {
    const html = render("consent-required");
    assert.match(switchTag(html), /aria-checked="false"/);
    assert.match(switchTag(html), /aria-describedby="[^"]+"/);
    assert.ok(html.includes(escapeHtml(t.wallConsentRequiredNotice)));
    assert.ok(html.includes(escapeHtml(t.wallConsentRequiredAction)));
  });

  it("shows a turned-off wall as off, without the notice", () => {
    const html = render("off");
    assert.match(switchTag(html), /aria-checked="false"/);
    assert.ok(!html.includes(escapeHtml(t.wallConsentRequiredNotice)));
  });

  it("starts the consent dialog closed, its box unchecked and its confirm disabled", () => {
    const html = render("off");
    const dialog = /<dialog[^>]*>[\s\S]*<\/dialog>/.exec(html)?.[0] ?? "";
    assert.doesNotMatch(dialog, /<dialog[^>]*\sopen/, "closed until the switch is used");
    const checkbox = /<input[^>]*type="checkbox"[^>]*>/.exec(dialog)?.[0] ?? "";
    assert.ok(checkbox, "has a checkbox");
    assert.doesNotMatch(checkbox, /checked/, "unchecked by default");
    const confirm = [...dialog.matchAll(/<button[^>]*>[\s\S]*?<\/button>/g)].map((m) => m[0]).find((b) => b.includes(escapeHtml(t.wallConsentConfirm)));
    assert.match(/<button[^>]*>/.exec(confirm ?? "")?.[0] ?? "", /disabled/, "confirm disabled until checked");
    for (const point of t.wallConsentPoints) assert.ok(dialog.includes(escapeHtml(point)), point);
    assert.ok(dialog.includes(escapeHtml(t.wallConsentVersionLabel.replace("{version}", PUBLIC_WALL_CONSENT_VERSION))));
    assert.match(dialog, /href="\/terms"/);
    assert.match(dialog, /href="\/privacy"/);
  });
});

describe("consent texts", () => {
  const en = getDictionary("en");

  it("exist in every language with the same points and legal sections", () => {
    for (const locale of locales) {
      const d = getDictionary(locale);
      assert.equal(d.profile.wallConsentPoints.length, en.profile.wallConsentPoints.length, locale);
      for (const point of d.profile.wallConsentPoints) assert.ok(point.trim().length > 0, locale);
      assert.match(d.profile.wallConsentVersionLabel, /\{version\}/, locale);
      assert.equal(d.legal.termsSections.length, en.legal.termsSections.length, `${locale} terms`);
      assert.equal(d.legal.privacySections.length, en.legal.privacySections.length, `${locale} privacy`);
    }
  });

  it("mark every new legal draft as needing legal review", () => {
    for (const locale of locales) {
      const source = readFileSync(`src/i18n/translations/${locale}.ts`, "utf8");
      const drafts = source.match(/LEGAL REVIEW REQUIRED: draft/g) ?? [];
      assert.equal(drafts.length, 3, `${locale}: consent dialog, terms and privacy drafts`);
    }
  });
});
