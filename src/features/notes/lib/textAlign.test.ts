import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { toShareCardNote } from "@/features/sharing/lib/shareCardData";
import type { BoardTileMessage } from "@/features/board/types";
import { Note } from "../components/Note";
import { getNoteTemplate } from "../config/templates";
import type { NoteData, NoteTextAlign } from "../types";
import { effectiveTextAlign, NOTE_TEXT_ALIGNS, textAlignClass, toNoteTextAlign } from "./textAlign";

const ALIGNS: NoteTextAlign[] = ["auto", "left", "center", "right"];

describe("allowed values", () => {
  it("are exactly auto, left, center and right", () => {
    assert.deepEqual([...NOTE_TEXT_ALIGNS], ALIGNS);
  });

  it("read anything unknown or missing as auto", () => {
    for (const value of [undefined, null, "", "justify", "LEFT", "start", 3, {}]) assert.equal(toNoteTextAlign(value), "auto", String(value));
    for (const value of ALIGNS) assert.equal(toNoteTextAlign(value), value);
  });

  it("are the same in the schema, migration 0024's CHECK and the journal", () => {
    const migration = readFileSync("drizzle/0024_note_text_align.sql", "utf8");
    assert.match(migration, /ADD COLUMN "text_align" text DEFAULT 'auto' NOT NULL/);
    const checked = /CHECK \("messages"\."text_align" in \(([^)]*)\)\)/.exec(migration)?.[1];
    assert.deepEqual(checked?.split(",").map((v) => v.trim().replace(/'/g, "")), ALIGNS);
    const schema = readFileSync("src/lib/db/schema.ts", "utf8");
    assert.match(schema, /textAlign: text\("text_align"\)\.notNull\(\)\.default\("auto"\)/);
    assert.match(schema, /check\("messages_text_align_check", sql`\$\{table\.textAlign\} in \('auto', 'left', 'center', 'right'\)`\)/);
    // 0024 is recorded once, right after 0023 — later migrations may follow it.
    const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as { entries: { idx: number; tag: string }[] };
    const tags = journal.entries.map((entry) => entry.tag);
    const at = tags.indexOf("0024_note_text_align");
    assert.equal(journal.entries[at]?.idx, 24);
    assert.equal(tags.filter((tag) => tag === "0024_note_text_align").length, 1);
    assert.equal(tags[at - 1], "0023_first_share_reward");
  });
});

describe("effective alignment", () => {
  it("keeps every choice on every card but the football disc", () => {
    for (const shape of ["sticky", "rect", "heart", "polaroid", "confetti"] as const) {
      for (const value of ALIGNS) assert.equal(effectiveTextAlign(value, shape), value);
      assert.equal(effectiveTextAlign(undefined, shape), "auto");
    }
  });

  it("always centers the football disc — every value is ignored there", () => {
    for (const value of [...ALIGNS, undefined]) assert.equal(effectiveTextAlign(value, "football"), "auto");
  });

  it("maps to a class only for an explicit choice", () => {
    assert.equal(textAlignClass("auto"), undefined);
    assert.equal(textAlignClass("left"), "text-left");
    assert.equal(textAlignClass("center"), "text-center");
    assert.equal(textAlignClass("right"), "text-right");
  });
});

describe("Note DOM", () => {
  // One real template per text layout Note.tsx has.
  const CARDS = {
    sticky: "classic-yellow",
    polaroid: "polaroid",
    torn: "torn-kraft",
    specialDay: "birthday-confetti",
    heart: "valentines-heart",
    standardCard: "standard-classic",
    football: "sport-yellow-red",
  };

  it("uses real templates of the shapes it names", () => {
    assert.equal(getNoteTemplate(CARDS.polaroid).shape, "polaroid");
    assert.equal(getNoteTemplate(CARDS.torn).shape, "torn");
    assert.equal(getNoteTemplate(CARDS.heart).shape, "heart");
    assert.equal(getNoteTemplate(CARDS.football).shape, "football");
    assert.equal(getNoteTemplate(CARDS.standardCard).contentTextSize, "spacious");
  });
  const render = (templateId: string, textAlign?: NoteTextAlign) => {
    const note: NoteData = {
      id: "n",
      content: "Bugün denize baktım.\nSonra eve döndüm.",
      authorName: "Ayşe",
      templateId,
      size: "md",
      rotation: 0,
      position: { top: "0%", left: "0%" },
      ...(textAlign ? { textAlign } : {}),
    };
    return renderToStaticMarkup(createElement(Note, { note, variant: "static" }));
  };
  const textClass = (html: string) => /<p[^>]*class="([^"]*)"/.exec(html)?.[1] ?? "";
  const authorClass = (html: string) => /<span[^>]*class="([^"]*text-ink-soft[^"]*)"/.exec(html)?.[1] ?? "";

  it("renders 'auto' exactly like a note without the field (every earlier message)", () => {
    for (const templateId of Object.values(CARDS)) assert.equal(render(templateId, "auto"), render(templateId), templateId);
  });

  it("aligns the text and its author line on every card but football", () => {
    for (const [name, templateId] of Object.entries(CARDS)) {
      if (name === "football") continue;
      for (const value of ["left", "center", "right"] as const) {
        const html = render(templateId, value);
        assert.ok(textClass(html).split(" ").includes(`text-${value}`), `${name} text ${value}`);
        assert.ok(authorClass(html).split(" ").includes(`text-${value}`), `${name} author ${value}`);
      }
      for (const cls of ["text-left", "text-center", "text-right"]) assert.ok(!textClass(render(templateId)).split(" ").includes(cls), `${name} auto`);
    }
  });

  it("keeps the football disc centered whatever is chosen", () => {
    const base = render(CARDS.football);
    for (const value of ALIGNS) assert.equal(render(CARDS.football, value), base, value);
    assert.match(base, /text-center/);
  });
});

describe("share data", () => {
  it("passes the stored alignment to the share card and PDF renderer", () => {
    const message = {
      id: "m", content: "x", templateId: "standard-classic", fontFamily: "modern", textAlign: "right",
      author: null, createdAt: "2026-10-14T00:00:00.000Z", language: "tr",
    } as unknown as BoardTileMessage;
    assert.equal(toShareCardNote(message).textAlign, "right");
    assert.equal(toShareCardNote({ ...message, textAlign: undefined }).textAlign, undefined);
  });
});
