import assert from "node:assert/strict";
import { before, describe, it, mock } from "node:test";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { PublicMessageDetail } from "@/features/board/types";
import { defaultLocale } from "@/i18n/config";
import { LocaleProvider } from "@/i18n/LocaleProvider";
import { getDictionary } from "@/i18n/translations";
import type { PersonalWallNote, PublicWallResult } from "./types";

// Public wall cards link to /share/[messageId]; the owner's /me preview
// doesn't; /share is a neutral, commerce-free page for visitors. Against
// mocked server modules only (no database). Run with module mocks:
//   npm run test:wall-links

const dictionary = getDictionary(defaultLocale);

const wallNote = (id: string, content: string): PersonalWallNote => ({
  id,
  content,
  templateId: "classic-yellow",
  fontFamily: "modern",
  textAlign: "auto",
  rotation: 0,
  language: "tr",
  createdAt: "2026-10-14T00:00:00.000Z",
});

const notes = [wallNote("note-1", "Bugün denize baktım."), wallNote("note-2", "Sonra eve döndüm.")];
const profile = { publicId: "pub123", displayName: "Ayşe", image: null };

let WallNotes: typeof import("./components/WallNotes").WallNotes;
let PublicWallContent: typeof import("@/app/u/[publicId]/_components/PublicWallContent").PublicWallContent;
let MePageContent: typeof import("@/app/me/_components/MePageContent").MePageContent;
let SharePageContent: typeof import("@/app/share/[messageId]/_components/SharePageContent").SharePageContent;

before(async () => {
  mock.module("@/features/auth/auth", {
    namedExports: { auth: async () => null, signIn: async () => {}, signOut: async () => {} },
  });
  mock.module("next/navigation", {
    namedExports: {
      useSearchParams: () => new URLSearchParams(),
      useRouter: () => ({ push() {}, replace() {}, refresh() {} }),
      usePathname: () => "/",
    },
  });
  mock.module("@/features/blocks/actions", { namedExports: { blockUser: async () => ({ ok: true }), unblockUser: async () => ({ ok: true }) } });
  mock.module("@/features/profile/actions", {
    namedExports: { setWallVisibility: async () => ({ ok: true }), setWallDescription: async () => ({ ok: true }), setMessageWallVisibility: async () => ({ ok: true }) },
  });
  mock.module("@/features/tokens/reward-actions", { namedExports: { claimFirstShareReward: async () => ({ status: "already-claimed" }) } });

  ({ WallNotes } = await import("./components/WallNotes"));
  ({ PublicWallContent } = await import("@/app/u/[publicId]/_components/PublicWallContent"));
  ({ MePageContent } = await import("@/app/me/_components/MePageContent"));
  ({ SharePageContent } = await import("@/app/share/[messageId]/_components/SharePageContent"));
});

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
const inLocale = (node: React.ReactNode) => renderToStaticMarkup(<LocaleProvider>{node}</LocaleProvider>);
const shareLinks = (html: string) => [...html.matchAll(/<a [^>]*href="\/share\/([^"]+)"[^>]*>/g)];
const openLabel = (text: string) => escapeHtml(dictionary.publicWall.openCardLabel.replace("{text}", text));

describe("WallNotes", () => {
  const label = (note: PersonalWallNote) => `open ${note.id}`;

  it("makes every card one link to its /share page when given a link label", () => {
    const links = shareLinks(renderToStaticMarkup(<WallNotes notes={notes} profile={profile} emptyMessage="empty" cardLinkLabel={label} />));
    assert.deepEqual(links.map((link) => link[1]), ["note-1", "note-2"]);
    for (const [tag, id] of links.map((link) => [link[0], link[1]])) {
      assert.match(tag, new RegExp(`aria-label="open ${id}"`), "accessible name");
      assert.match(tag, /focus-visible:ring-2/, "visible keyboard focus");
    }
  });

  it("draws the same card inside the link as without it", () => {
    const plain = renderToStaticMarkup(<WallNotes notes={notes} profile={profile} emptyMessage="empty" />);
    const linked = renderToStaticMarkup(<WallNotes notes={notes} profile={profile} emptyMessage="empty" cardLinkLabel={label} />);
    assert.equal(linked.replace(/<a [^>]*>|<\/a>/g, ""), plain);
  });

  it("stays plain cards without a link label (the /me preview)", () => {
    const html = renderToStaticMarkup(<WallNotes notes={notes} profile={profile} emptyMessage="empty" />);
    assert.equal(shareLinks(html).length, 0);
    assert.doesNotMatch(html, /<a /);
  });

  it("renders no links for an empty wall", () => {
    const html = renderToStaticMarkup(<WallNotes notes={[]} profile={profile} emptyMessage="empty" cardLinkLabel={label} />);
    assert.doesNotMatch(html, /<a /);
    assert.match(html, /empty/);
  });
});

describe("public wall page", () => {
  const render = (wall: PublicWallResult) =>
    inLocale(<PublicWallContent publicId="pub123" wall={wall} page={1} totalPages={1} canBlock={false} />);

  it("links each card with a localized name carrying the start of its text", () => {
    const longText = `Bir   satır\nve ${"uzun ".repeat(20)}son`;
    const html = render({ status: "ok", profile, description: null, notes: [...notes, wallNote("note-3", longText)], total: 3 });
    const links = shareLinks(html);
    assert.deepEqual(links.map((link) => link[1]), ["note-1", "note-2", "note-3"]);
    assert.match(links[0][0], new RegExp(`aria-label="${openLabel("Bugün denize baktım.")}"`));
    const third = /aria-label="([^"]*)"/.exec(links[2][0])?.[1] ?? "";
    assert.ok(third.startsWith(openLabel("Bir satır ve uzun")), "whitespace collapsed");
    assert.ok(third.endsWith("…"), "long text shortened");
  });

  it("has no card links when the wall isn't public", () => {
    assert.equal(shareLinks(render({ status: "disabled", profile })).length, 0);
    assert.equal(shareLinks(render({ status: "not-found" })).length, 0);
  });
});

describe("/me wall preview", () => {
  it("keeps its cards unlinked", () => {
    const html = inLocale(
      <MePageContent
        isSignedIn
        data={{
          displayName: "Ayşe",
          image: null,
          publicId: "pub123",
          wallNotes: notes,
          thoughtsCount: 2,
          memoriesCount: 0,
          digitalCount: 0,
          physicalCount: 0,
          wallState: "public",
          publicWallDescription: null,
          totalWrittenCount: 2,
          publishedCount: 2,
          pendingCount: 0,
          accountEmail: null,
          blockedUsers: [],
        }}
      />
    );
    assert.match(html, /Bugün denize baktım\./, "the preview renders the cards");
    assert.equal(shareLinks(html).length, 0);
  });
});

describe("/share page", () => {
  const message = {
    id: "note-1",
    content: "Bugün denize baktım.",
    templateId: "classic-yellow",
    fontFamily: "modern",
    textAlign: "auto",
    position: { x: 0, y: 0 },
    rotation: 0,
    language: "tr",
    createdAt: "2026-10-14T00:00:00.000Z",
    author: { displayName: "Ayşe", image: null },
    likeCount: 0,
    tileX: 0,
    tileY: 0,
  } satisfies PublicMessageDetail;
  const render = (props: Partial<ComponentProps<typeof SharePageContent>> = {}) =>
    inLocale(
      <SharePageContent
        messageId="note-1"
        message={message}
        pageUrl="https://example.test/share/note-1"
        signedIn={false}
        firstShareRewardAmount={2}
        firstShareRewardAvailable={false}
        {...props}
      />
    );

  it("is titled neutrally", () => {
    assert.equal(getDictionary("tr").share.pageTitle, "Bir düşünce");
    assert.match(render(), new RegExp(`<h1[^>]*>${escapeHtml(dictionary.share.pageTitle)}</h1>`));
  });

  it("has no Shoppier box", () => {
    const html = render();
    assert.ok(!html.includes(escapeHtml(dictionary.memory.shoppierButton)));
    assert.ok(!html.includes(escapeHtml(dictionary.memory.shoppierUnavailable)));
  });

  it("keeps sharing and downloading, and the first-share offer for a signed-in viewer", () => {
    const html = render({ signedIn: true, firstShareRewardAvailable: true });
    assert.ok(html.includes(escapeHtml(dictionary.share.shareAndEarnButton.replace("{count}", "2"))), "reward offer");
    assert.ok(html.includes(escapeHtml(dictionary.share.socialHeading)), "share section");
    assert.ok(!render().includes(escapeHtml(dictionary.share.shareAndEarnButton.replace("{count}", "2"))), "no offer signed out");
  });
});
