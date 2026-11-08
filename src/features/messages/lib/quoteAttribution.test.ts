import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  quoteAttributionDraftError,
  quoteAttributionDraftFor,
  toQuoteAttributionInput,
} from "../components/QuoteAttributionFields";
import { normalizeQuoteAuthor, OWN_WORDS, QUOTE_AUTHOR_MAX_LENGTH, resolveQuoteAttribution } from "./quoteAttribution";

describe("resolveQuoteAttribution", () => {
  it("stores own words with no author, whatever was typed", () => {
    assert.deepEqual(resolveQuoteAttribution({ isQuote: false, quoteAuthor: "Birisi" }), { ok: true, attribution: OWN_WORDS });
    assert.deepEqual(resolveQuoteAttribution({ isQuote: false, quoteAuthorUnknown: true }), { ok: true, attribution: OWN_WORDS });
  });

  it("requires an author for a quote — empty, whitespace or missing is refused", () => {
    for (const quoteAuthor of ["", "   ", "\n\t", null, undefined]) {
      assert.deepEqual(resolveQuoteAttribution({ isQuote: true, quoteAuthor }), { ok: false, error: "quote-author-required" }, String(quoteAuthor));
    }
  });

  it("accepts “Unknown” instead of a name, and Unknown wins over a typed name", () => {
    assert.deepEqual(resolveQuoteAttribution({ isQuote: true, quoteAuthorUnknown: true }), { ok: true, attribution: { isQuote: true, quoteAuthor: null } });
    assert.deepEqual(resolveQuoteAttribution({ isQuote: true, quoteAuthor: "Ad", quoteAuthorUnknown: true }), {
      ok: true,
      attribution: { isQuote: true, quoteAuthor: null },
    });
  });

  it("accepts exactly 80 characters and refuses 81 — counted in code points, after normalizing", () => {
    assert.equal(QUOTE_AUTHOR_MAX_LENGTH, 80);
    assert.deepEqual(resolveQuoteAttribution({ isQuote: true, quoteAuthor: "ş".repeat(80) }), {
      ok: true,
      attribution: { isQuote: true, quoteAuthor: "ş".repeat(80) },
    });
    assert.deepEqual(resolveQuoteAttribution({ isQuote: true, quoteAuthor: "ş".repeat(81) }), { ok: false, error: "quote-author-too-long" });
    // 80 emoji are 160 UTF-16 units but 80 characters.
    assert.equal(resolveQuoteAttribution({ isQuote: true, quoteAuthor: "🌙".repeat(80) }).ok, true);
    // Surrounding whitespace doesn't count against the limit.
    assert.equal(resolveQuoteAttribution({ isQuote: true, quoteAuthor: `   ${"a".repeat(80)}   ` }).ok, true);
  });

  it("keeps a name on one line: control characters and runs of whitespace become one space", () => {
    assert.equal(normalizeQuoteAuthor("  Nâzım\n\nHikmet\t "), "Nâzım Hikmet");
    assert.equal(normalizeQuoteAuthor("A\u0000B C"), "A B C");
    assert.deepEqual(resolveQuoteAttribution({ isQuote: true, quoteAuthor: " Orhan   Veli\r\n" }), {
      ok: true,
      attribution: { isQuote: true, quoteAuthor: "Orhan Veli" },
    });
  });
});

describe("the write form's attribution draft", () => {
  it("has no default: an untouched choice blocks submitting", () => {
    assert.equal(quoteAttributionDraftError({ choice: null, quoteAuthor: "", quoteAuthorUnknown: false }), "choice-required");
  });

  it("mirrors the server rules for a quote", () => {
    assert.equal(quoteAttributionDraftError({ choice: "own", quoteAuthor: "", quoteAuthorUnknown: false }), null);
    assert.equal(quoteAttributionDraftError({ choice: "quote", quoteAuthor: "  ", quoteAuthorUnknown: false }), "quote-author-required");
    assert.equal(quoteAttributionDraftError({ choice: "quote", quoteAuthor: "x".repeat(81), quoteAuthorUnknown: false }), "quote-author-too-long");
    assert.equal(quoteAttributionDraftError({ choice: "quote", quoteAuthor: "", quoteAuthorUnknown: true }), null);
    assert.equal(quoteAttributionDraftError({ choice: "quote", quoteAuthor: "Sezen Aksu", quoteAuthorUnknown: false }), null);
  });

  it("round-trips a stored attribution into the edit dialog and back to the server input", () => {
    assert.deepEqual(toQuoteAttributionInput(quoteAttributionDraftFor(true, "Cemal Süreya")), {
      isQuote: true,
      quoteAuthor: "Cemal Süreya",
      quoteAuthorUnknown: false,
    });
    assert.deepEqual(toQuoteAttributionInput(quoteAttributionDraftFor(true, null)), { isQuote: true, quoteAuthor: "", quoteAuthorUnknown: true });
    assert.equal(toQuoteAttributionInput(quoteAttributionDraftFor(false, null)).isQuote, false);
  });
});
