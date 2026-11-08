import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { BoardTileMessage } from "@/features/board/types";
import { Note } from "@/features/notes/components/Note";
import type { NoteData } from "@/features/notes/types";
import { toShareCardNote } from "@/features/sharing/lib/shareCardData";
import { MemoryNoteCard } from "@/features/sharing/services/noteCardSatori";
import { getDictionary } from "@/i18n/translations";
import { quoteBylineLines } from "./quoteByline";

const tr = getDictionary("tr").quote;
const en = getDictionary("en").quote;

describe("quoteBylineLines", () => {
  it("names the quote's author, and the sharer below", () => {
    assert.deepEqual(quoteBylineLines("Nâzım Hikmet", "Ayşe", tr), { authorLine: "— Nâzım Hikmet", sharedByLine: "paylaşan: Ayşe" });
    assert.deepEqual(quoteBylineLines("Maya Angelou", "Sam", en), { authorLine: "— Maya Angelou", sharedByLine: "shared by Sam" });
  });

  it("reads an unknown author and an anonymous sharer in the given language", () => {
    assert.deepEqual(quoteBylineLines(null, "anonymous", tr), { authorLine: "— Bilinmiyor", sharedByLine: "paylaşan: anonim" });
    assert.deepEqual(quoteBylineLines(null, null, en), { authorLine: "— Unknown", sharedByLine: "shared by anonymous" });
  });

  it("draws no author line for a quote whose author isn't entered yet (\"\") — the write preview", () => {
    assert.deepEqual(quoteBylineLines("", "Ayşe", tr), { authorLine: null, sharedByLine: "paylaşan: Ayşe" });
  });

  it("draws no sharer line when the caller passes no name on purpose (the owner's archive, the wall image)", () => {
    assert.deepEqual(quoteBylineLines("Can Yücel", "", tr), { authorLine: "— Can Yücel", sharedByLine: null });
  });
});

function note(overrides: Partial<NoteData>): NoteData {
  return {
    id: "n1",
    content: "Yaşamak bir ağaç gibi tek ve hür ve bir orman gibi kardeşçesine.",
    authorName: "Ayşe",
    templateId: "standard-classic",
    size: "md",
    rotation: 0,
    position: { top: "0%", left: "0%" },
    language: "tr",
    ...overrides,
  };
}

/** The visible text of a rendered card, tags stripped and entities decoded. */
function textOf(html: string): string {
  return html.replace(/<[^>]+>/g, "\n").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\n+/g, "\n");
}

describe("Note — the card on the board, the wall, the write preview", () => {
  // A spacious image card (standard-classic), a CSS-drawn card (classic-yellow — its image is only a picker
  // thumbnail) and the football disc; the compact Special Day image cards are covered by the iPad measurement.
  const templates = ["standard-classic", "classic-yellow", "sport-yellow-red"];

  it("keeps own words' single byline exactly as before", () => {
    for (const templateId of templates) {
      const text = textOf(renderToStaticMarkup(<Note variant="static" note={note({ templateId })} />));
      assert.match(text, /— Ayşe/, templateId);
      assert.doesNotMatch(text, /paylaşan/, templateId);
    }
  });

  it("shows “— {author}” as the byline and the sharer under it on a quote, on every live card kind", () => {
    for (const templateId of templates) {
      const text = textOf(renderToStaticMarkup(<Note variant="static" note={note({ templateId, isQuote: true, quoteAuthor: "Nâzım Hikmet" })} />));
      const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
      const authorIndex = lines.indexOf("— Nâzım Hikmet");
      assert.ok(authorIndex > 0, `${templateId}: ${lines.join(" | ")}`);
      assert.equal(lines[authorIndex + 1], "paylaşan: Ayşe", templateId);
      assert.ok(!lines.includes("— Ayşe"), `${templateId}: the sharer must not read as the author`);
    }
  });

  it("shows no “— Unknown” in the write preview while the author is still empty", () => {
    const text = textOf(renderToStaticMarkup(<Note variant="static" note={note({ isQuote: true, quoteAuthor: "" })} />));
    assert.doesNotMatch(text, /Bilinmiyor/);
    assert.match(text, /paylaşan: Ayşe/);
  });

  it("reads an unknown author and an anonymous sharer", () => {
    const text = textOf(renderToStaticMarkup(<Note variant="static" note={note({ authorName: "anonymous", isQuote: true, quoteAuthor: null })} />));
    assert.match(text, /— Bilinmiyor/);
    assert.match(text, /paylaşan: anonim/);
  });
});

/** Every string in a Satori element tree (MemoryNoteCard is a plain, hook-free function). */
function satoriText(node: ReactNode): string[] {
  if (node === null || node === undefined || typeof node === "boolean") return [];
  if (typeof node === "string" || typeof node === "number") return [String(node)];
  if (Array.isArray(node)) return node.flatMap(satoriText);
  if (isValidElement(node)) {
    const { type, props } = node as { type: unknown; props: { children?: ReactNode } };
    if (typeof type === "function") return satoriText((type as (p: unknown) => ReactNode)(props));
    return satoriText(props.children);
  }
  return [];
}

const boardMessage = (overrides: Partial<BoardTileMessage>): BoardTileMessage => ({
  id: "m1",
  content: "Ne kadar güzel bir gün.",
  templateId: "classic-yellow",
  fontFamily: "modern",
  position: { x: 0.5, y: 0.5 },
  rotation: 0,
  language: "tr",
  createdAt: "2026-11-08T10:00:00.000Z",
  author: { displayName: "Ayşe", image: null },
  likeCount: 0,
  ...overrides,
});

describe("MemoryNoteCard — the share image and the PDF card", () => {
  it("prints the quote's two lines in the note's own language", () => {
    const share = toShareCardNote(boardMessage({ isQuote: true, quoteAuthor: "Orhan Veli" }));
    assert.deepEqual(share.quote, { authorLine: "— Orhan Veli", sharedByLine: "paylaşan: Ayşe" });
    const english = toShareCardNote(boardMessage({ language: "en", author: null, isQuote: true, quoteAuthor: null }));
    assert.deepEqual(english.quote, { authorLine: "— Unknown", sharedByLine: "shared by anonymous" });
    assert.equal(toShareCardNote(boardMessage({})).quote, null);
  });

  it("draws the quote lines instead of “— {name}” on CSS, compact and spacious image, and football cards", () => {
    const quote = { authorLine: "— Orhan Veli", sharedByLine: "paylaşan: Ayşe" };
    for (const templateId of ["classic-yellow", "celebration-spark", "sport-yellow-red", "standard-classic"]) {
      const text = satoriText(
        <MemoryNoteCard content="Ne kadar güzel bir gün." authorName="Ayşe" quote={quote} templateId={templateId} fontFamily="modern" rotation={0} width={600} artworkDataUri="data:image/png;base64," />
      );
      assert.ok(text.includes("— Orhan Veli"), `${templateId}: ${text.join(" | ")}`);
      assert.ok(text.includes("paylaşan: Ayşe"), templateId);
      assert.ok(!text.join("").includes("— Ayşe"), templateId);
    }
  });

  it("keeps own words' “— {name}” line", () => {
    const text = satoriText(
      <MemoryNoteCard content="Ne kadar güzel bir gün." authorName="Ayşe" templateId="classic-yellow" fontFamily="modern" rotation={0} width={600} />
    );
    assert.ok(text.join("").includes("— Ayşe"));
    assert.ok(!text.join("").includes("paylaşan"));
  });
});
