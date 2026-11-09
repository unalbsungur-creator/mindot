import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { noteTemplates } from "../config/templates";
import { noteDisplayContent, stripWrappingQuoteMarks } from "./displayContent";

describe("stripWrappingQuoteMarks", () => {
  it("drops every kind of quote mark wrapping the whole text", () => {
    assert.equal(stripWrappingQuoteMarks('"Hayat güzel."'), "Hayat güzel.");
    assert.equal(stripWrappingQuoteMarks("“Life is short.”"), "Life is short.");
    assert.equal(stripWrappingQuoteMarks("« La vie est belle. »"), "La vie est belle.");
    assert.equal(stripWrappingQuoteMarks("»Das Leben«"), "Das Leben");
    assert.equal(stripWrappingQuoteMarks("„Das Leben ist schön.“"), "Das Leben ist schön.");
    assert.equal(stripWrappingQuoteMarks("”Ters tırnak“"), "Ters tırnak");
    assert.equal(stripWrappingQuoteMarks('""Çift çift""'), "Çift çift");
  });

  it("drops a mark that only opens or only closes the text", () => {
    assert.equal(stripWrappingQuoteMarks("“Kapanmamış alıntı"), "Kapanmamış alıntı");
    assert.equal(stripWrappingQuoteMarks("Açılmamış alıntı”"), "Açılmamış alıntı");
  });

  it("keeps sentence punctuation after the closing mark", () => {
    assert.equal(stripWrappingQuoteMarks('"Hayat güzel".'), "Hayat güzel.");
    assert.equal(stripWrappingQuoteMarks("“Neden?”!"), "Neden?!");
  });

  it("leaves surrounding whitespace and line breaks inside the text alone", () => {
    assert.equal(stripWrappingQuoteMarks("  “Satır bir\nsatır iki”  "), "Satır bir\nsatır iki");
  });

  it("leaves text untouched when marks also appear inside it", () => {
    for (const text of ['"Hayat" dedi, "güzel"', '"Hayat" dedi.', "Bir “söz” bu", "Annem «sabır» derdi"]) {
      assert.equal(stripWrappingQuoteMarks(text), text);
    }
  });

  it("leaves text without wrapping marks, apostrophes and mark-only text untouched", () => {
    for (const text of ["Hayat güzel.", "Don't leave it unsaid.", "'Tek tırnak'", '""', "“ ”", ""]) {
      assert.equal(stripWrappingQuoteMarks(text), text);
    }
  });
});

describe("noteDisplayContent", () => {
  it("strips wrapping marks only on a card whose artwork prints its own", () => {
    assert.equal(noteDisplayContent("standard-quote", "“Hayat güzel.”"), "Hayat güzel.");
    assert.equal(noteDisplayContent("standard-classic", "“Hayat güzel.”"), "“Hayat güzel.”");
    assert.equal(noteDisplayContent("classic-yellow", '"Hayat güzel."'), '"Hayat güzel."');
  });

  it("the quote card is the only template that draws decorative quote marks", () => {
    assert.deepEqual(
      noteTemplates.filter((template) => template.decorativeQuoteMarks).map((template) => template.id),
      ["standard-quote"]
    );
  });
});
