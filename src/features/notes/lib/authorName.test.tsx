import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Note } from "@/features/notes/components/Note";
import type { NoteData } from "@/features/notes/types";
import { locales } from "@/i18n/config";
import { getDictionary } from "@/i18n/translations";
import { ANONYMOUS_AUTHOR_NAME } from "@/features/messages/lib/quoteBackfill";
import { ANONYMOUS_PLACEHOLDER, displayAuthorName } from "./authorName";

const note = (overrides: Partial<NoteData>): NoteData => ({
  id: "n1",
  content: "Bir gün herkes kendi noktasını bulacak.",
  authorName: "anonymous",
  templateId: "warm-cream",
  size: "sm",
  rotation: 0,
  position: { top: "0%", left: "0%" },
  ...overrides,
});

describe("the stored “anonymous” placeholder on cards", () => {
  it("is the same placeholder the quote backfill writes", () => {
    assert.equal(ANONYMOUS_AUTHOR_NAME, ANONYMOUS_PLACEHOLDER);
  });

  it("reads as each interface language's own word; real names stay as written", () => {
    const expected = { tr: "anonim", en: "anonymous", de: "anonym", fr: "anonyme", es: "anónimo" } as const;
    for (const locale of locales) {
      const label = getDictionary(locale).quote.anonymousSharer;
      assert.equal(displayAuthorName("anonymous", label), expected[locale]);
      assert.equal(displayAuthorName("Deniz", label), "Deniz");
    }
  });

  it("is never drawn untranslated by a card — own words, quotes, and every card shape (TR)", () => {
    for (const templateId of ["warm-cream", "standard-classic", "sport-yellow-red"]) {
      const own = renderToStaticMarkup(<Note variant="static" note={note({ templateId })} />);
      assert.match(own, /— anonim/, templateId);
      assert.doesNotMatch(own, /anonymous/, templateId);
    }
    const quote = renderToStaticMarkup(<Note variant="static" note={note({ isQuote: true, quoteAuthor: "Marcus Aurelius" })} />);
    assert.match(quote, /paylaşan: anonim/);
    assert.doesNotMatch(quote, /anonymous/);
    assert.match(renderToStaticMarkup(<Note variant="static" note={note({ authorName: "Deniz Test" })} />), /— Deniz Test/);
  });
});
