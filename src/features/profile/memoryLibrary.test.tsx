import assert from "node:assert/strict";
import { before, describe, it, mock } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { PublicMessageDetail } from "@/features/board/types";
import type { MemoryProject } from "@/features/memories/types";
import { defaultLocale } from "@/i18n/config";
import { LocaleProvider } from "@/i18n/LocaleProvider";
import { getDictionary } from "@/i18n/translations";
import type { MemoryLibraryItem } from "./types";

// The /me/memories library: "view memory project" links to /memory/[messageId],
// which only opens a currently public thought — so the link is shown only
// while the project's source is available. Against mocked dependencies only
// (no database). Run with module mocks: npm run test:memories

const dictionary = getDictionary(defaultLocale);

const publicMessage: PublicMessageDetail = {
  id: "message-public",
  content: "a public thought",
  templateId: "classic-yellow",
  fontFamily: "modern",
  position: { x: 0, y: 0 },
  rotation: 0,
  language: "tr",
  createdAt: "2026-10-14T00:00:00.000Z",
  author: null,
  likeCount: 0,
  tileX: 0,
  tileY: 0,
};

const project = (id: string, messageId: string): MemoryProject =>
  ({
    id,
    messageId,
    createdBy: "user-1",
    captureMode: "note_only",
    outputType: "physical_gift",
    frameTemplateId: null,
    status: "draft",
    createdAt: "2026-10-14T00:00:00.000Z",
    updatedAt: "2026-10-14T00:00:00.000Z",
  }) as MemoryProject;

let getMemoryLibrary: typeof import("./repository").getMemoryLibrary;
let MemoryLibraryContent: typeof import("@/app/me/memories/_components/MemoryLibraryContent").MemoryLibraryContent;

before(async () => {
  mock.module("@/features/auth/auth", {
    namedExports: { auth: async () => null, signIn: async () => {}, signOut: async () => {} },
  });
  // Every message but the public one reads as unavailable — what an archived source returns.
  mock.module("@/features/board/repository", {
    namedExports: { getPublicMessageById: async (id: string) => (id === publicMessage.id ? publicMessage : null) },
  });
  mock.module("@/features/memories/repository", {
    namedExports: {
      memoryRepository: { listByCreator: async () => [project("project-public", "message-public"), project("project-archived", "message-archived")] },
      physicalOrderRepository: { getByMemoryProjectId: async () => null },
      digitalAccessCodeRepository: {},
      memoryPdfUnlockRepository: {},
    },
  });
  mock.module("@/features/blocks/repository", { namedExports: { blockRepository: {} } });
  mock.module("@/features/messages/repository", { namedExports: { messageRepository: {} } });
  mock.module("@/features/users/repository", { namedExports: { userRepository: {} } });

  ({ getMemoryLibrary } = await import("./repository"));
  ({ MemoryLibraryContent } = await import("@/app/me/memories/_components/MemoryLibraryContent"));
});

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

const item = (overrides: Partial<MemoryLibraryItem>): MemoryLibraryItem => ({
  projectId: "project-1",
  messageId: "message-1",
  noteContent: "a public thought",
  noteTemplateId: "classic-yellow",
  noteFontFamily: "modern",
  noteTextAlign: null,
  noteLanguage: "tr",
  captureMode: "note_only",
  outputType: "physical_gift",
  frameName: null,
  createdAt: "2026-10-14T00:00:00.000Z",
  digitalStatus: "not_applicable",
  pdfUnlocked: false,
  sourceAvailable: true,
  physicalOrder: null,
  ...overrides,
});

const render = (items: MemoryLibraryItem[]) =>
  renderToStaticMarkup(
    <LocaleProvider>
      <MemoryLibraryContent isSignedIn items={items} tokenBalance={0} />
    </LocaleProvider>
  );

const viewLink = escapeHtml(dictionary.memoryLibrary.viewProjectAction);

describe("memory library view link", () => {
  it("links an available source to /memory/<messageId>", () => {
    const html = render([item({ messageId: "message-1" })]);
    assert.ok(html.includes(`href="/memory/message-1"`), "link target");
    assert.ok(html.includes(`>${viewLink}</a>`), "link text");
  });

  it("is not rendered when the source isn't available", () => {
    const html = render([item({ messageId: "message-2", sourceAvailable: false, noteContent: null, noteTemplateId: null })]);
    assert.ok(!html.includes("/memory/message-2"), "no link to the source");
    assert.ok(!html.includes(viewLink), "no link text");
  });

  it("keeps the 'not available' note for an unavailable source", () => {
    const html = render([item({ sourceAvailable: false, noteContent: null, noteTemplateId: null })]);
    assert.ok(html.includes(escapeHtml(dictionary.memory.notEligibleBody)));
  });

  it("only drops the link on the unavailable card", () => {
    const html = render([
      item({ projectId: "p1", messageId: "message-1" }),
      item({ projectId: "p2", messageId: "message-2", sourceAvailable: false, noteContent: null, noteTemplateId: null }),
    ]);
    assert.ok(html.includes(`href="/memory/message-1"`));
    assert.ok(!html.includes("/memory/message-2"));
  });
});

describe("getMemoryLibrary", () => {
  it("marks a project whose source is no longer public as unavailable", async () => {
    const items = await getMemoryLibrary("user-1");
    const byId = Object.fromEntries(items.map((entry) => [entry.projectId, entry]));
    assert.equal(byId["project-public"].sourceAvailable, true);
    assert.equal(byId["project-public"].noteContent, publicMessage.content);
    assert.equal(byId["project-archived"].sourceAvailable, false);
    assert.equal(byId["project-archived"].noteContent, null);
    assert.equal(byId["project-archived"].noteTemplateId, null);
  });
});
