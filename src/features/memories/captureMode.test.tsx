import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, beforeEach, describe, it, mock } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { BoardTile, BoardTileMessage, PublicMessageDetail } from "@/features/board/types";
import { defaultLocale } from "@/i18n/config";
import { LocaleProvider } from "@/i18n/LocaleProvider";
import { getDictionary } from "@/i18n/translations";
import type { MemoryProject, NewMemoryProjectInput } from "./types";

// New memory projects are note_only; projects that already store
// note_with_surrounding keep rendering their tile neighbours. Against mocked
// dependencies only — no database, no Next.js request. Run with module mocks:
//   npm run test:memories

const dictionary = getDictionary(defaultLocale);

const tileNote = (id: string): BoardTileMessage => ({
  id,
  content: `note ${id}`,
  templateId: "classic-yellow",
  fontFamily: "modern",
  position: { x: 0, y: 0 },
  rotation: 0,
  language: "tr",
  createdAt: "2026-10-14T00:00:00.000Z",
  author: null,
  likeCount: 0,
});

const message: PublicMessageDetail = { ...tileNote("message-1"), tileX: 2, tileY: -1 };
const tile: BoardTile = { x: 2, y: -1, messages: [message, tileNote("neighbour-1"), tileNote("neighbour-2")] };

let session: { user: { id: string; role: "user" | "admin" } } | null;
const calls = { tile: [] as Array<[number, number]>, message: [] as string[], created: [] as NewMemoryProjectInput[], rendered: [] as unknown[] };

let resolveCaptureRegion: typeof import("./lib/captureRegion").resolveCaptureRegion;
let validateNewMemoryProject: typeof import("./lib/outputPolicy").validateNewMemoryProject;
let NEW_MEMORY_PROJECT_CAPTURE_MODE: typeof import("./lib/outputPolicy").NEW_MEMORY_PROJECT_CAPTURE_MODE;
let createMemoryProject: typeof import("./actions").createMemoryProject;
let MemoryPageContent: typeof import("@/app/memory/[messageId]/_components/MemoryPageContent").MemoryPageContent;
let shareNoteGET: typeof import("@/app/api/share/note/[messageId]/[formatId]/route").GET;

before(async () => {
  mock.module("@/features/auth/auth", {
    namedExports: { auth: async () => session, signIn: async () => {}, signOut: async () => {} },
  });
  mock.module("@/features/board/repository", {
    namedExports: {
      getPublicMessageById: async (id: string) => (calls.message.push(id), id === message.id ? message : null),
      getTile: async (x: number, y: number) => (calls.tile.push([x, y]), tile),
    },
  });
  mock.module("@/features/tokens/repository", { namedExports: { tokenRepository: {} } });
  mock.module("@/features/memories/repository", {
    namedExports: {
      memoryRepository: {
        create: async (input: NewMemoryProjectInput): Promise<MemoryProject> => {
          calls.created.push(input);
          return { id: "project-1", ...input, frameTemplateId: input.frameTemplateId ?? null, status: "draft", createdAt: "", updatedAt: "" } as MemoryProject;
        },
      },
      digitalAccessCodeRepository: {},
      memoryPdfUnlockRepository: {},
      physicalOrderRepository: {},
    },
  });
  mock.module("@/features/sharing/services/shareCardRenderer", {
    namedExports: {
      renderShareCard: async (input: unknown) => (calls.rendered.push(input), new Response("png")),
    },
  });

  ({ resolveCaptureRegion } = await import("./lib/captureRegion"));
  ({ validateNewMemoryProject, NEW_MEMORY_PROJECT_CAPTURE_MODE } = await import("./lib/outputPolicy"));
  ({ createMemoryProject } = await import("./actions"));
  ({ MemoryPageContent } = await import("@/app/memory/[messageId]/_components/MemoryPageContent"));
  ({ GET: shareNoteGET } = await import("@/app/api/share/note/[messageId]/[formatId]/route"));
});

beforeEach(() => {
  session = { user: { id: "user-1", role: "user" } };
  calls.tile = [];
  calls.message = [];
  calls.created = [];
  calls.rendered = [];
});

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

describe("new memory projects", () => {
  it("are created note_only", () => {
    assert.equal(NEW_MEMORY_PROJECT_CAPTURE_MODE, "note_only");
  });

  it("validation accepts note_only", () => {
    const live = { physicalGiftAvailable: false };
    assert.equal(validateNewMemoryProject({ outputType: "personal_pdf", captureMode: "note_only" }, live), null);
    assert.equal(validateNewMemoryProject({ outputType: "digital_frame", captureMode: "note_only", frameTemplateId: null }, live), null);
  });

  it("validation rejects note_with_surrounding and unknown values", () => {
    const live = { physicalGiftAvailable: true };
    for (const captureMode of ["note_with_surrounding", "whole_board", "", "NOTE_ONLY", undefined, null, 1]) {
      assert.equal(validateNewMemoryProject({ outputType: "personal_pdf", captureMode }, live), "invalid-capture-mode", String(captureMode));
    }
  });

  it("createMemoryProject refuses note_with_surrounding before any lookup", async () => {
    const result = await createMemoryProject({ messageId: message.id, captureMode: "note_with_surrounding", outputType: "personal_pdf" });
    assert.deepEqual(result, { ok: false, error: "invalid-capture-mode" });
    assert.deepEqual(calls.message, [], "no message lookup");
    assert.deepEqual(calls.created, [], "nothing created");
  });

  it("createMemoryProject stores a note_only project", async () => {
    const result = await createMemoryProject({ messageId: message.id, captureMode: "note_only", outputType: "personal_pdf" });
    assert.equal(result.ok, true);
    assert.equal(calls.created.length, 1);
    assert.equal(calls.created[0].captureMode, "note_only");
  });
});

describe("memory wizard", () => {
  const render = () =>
    renderToStaticMarkup(
      <LocaleProvider>
        <MemoryPageContent
          messageId={message.id}
          message={message}
          isSignedIn
          existingProjects={[]}
          tokenBalance={0}
          purchaseLinks={{ shoppierProductUrl: null, dilekkutumUrl: null }}
        />
      </LocaleProvider>
    );

  it("opens on the preview step, without the capture choice", () => {
    const html = render();
    assert.ok(html.includes(escapeHtml(dictionary.memory.step4Heading)), "preview heading");
    assert.ok(html.includes(escapeHtml(dictionary.memory.createButton)), "create button");
    assert.ok(!html.includes(escapeHtml(dictionary.memory.captureSurrounding)), "no 'note + surrounding wall' card");
    assert.ok(!html.includes(escapeHtml(dictionary.memory.step2Heading)), "no capture step heading");
    assert.ok(!html.includes('role="radio"'), "no option cards");
  });

  it("has no back button when there is no project list to return to", () => {
    assert.ok(!render().includes(`>${escapeHtml(dictionary.memory.backButton)}<`));
  });

  it("creates its project with the note_only capture", () => {
    // The click itself needs a DOM, which this suite doesn't have; the call site is checked instead.
    const source = readFileSync("src/app/memory/[messageId]/_components/MemoryPageContent.tsx", "utf8");
    assert.match(source, /captureMode: NEW_MEMORY_PROJECT_CAPTURE_MODE,/);
    assert.doesNotMatch(source, /note_with_surrounding/);
  });
});

describe("existing note_with_surrounding projects", () => {
  it("still resolve their tile neighbours", async () => {
    const region = await resolveCaptureRegion(message, "note_with_surrounding");
    assert.deepEqual(calls.tile, [[2, -1]]);
    assert.equal(region.primary, message);
    assert.deepEqual(region.surrounding.map((note) => note.id), ["neighbour-1", "neighbour-2"]);
  });

  it("note_only stays the note on its own, without a tile lookup", async () => {
    const region = await resolveCaptureRegion(message, "note_only");
    assert.deepEqual(region.surrounding, []);
    assert.deepEqual(calls.tile, []);
  });
});

describe("note share route", () => {
  const request = (mode: string) =>
    ({ url: `http://localhost/api/share/note/${message.id}/square?mode=${mode}` }) as Parameters<typeof shareNoteGET>[0];
  const params = { params: Promise.resolve({ messageId: message.id, formatId: "square" }) };
  const surroundingContent = () => (calls.rendered[0] as { surrounding: { content: string }[] }).surrounding.map((note) => note.content);

  it("keeps old ?mode=note_with_surrounding links rendering the neighbours", async () => {
    const response = await shareNoteGET(request("note_with_surrounding"), params);
    assert.equal(response.status, 200);
    assert.deepEqual(surroundingContent(), ["note neighbour-1", "note neighbour-2"]);
  });

  it("renders note_only links as the note on its own", async () => {
    const response = await shareNoteGET(request("note_only"), params);
    assert.equal(response.status, 200);
    assert.deepEqual(surroundingContent(), []);
  });
});
