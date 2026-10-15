import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeMessageContent } from "./messageContent";

test("keeps a single line break and one blank line between paragraphs", () => {
  assert.equal(normalizeMessageContent("Bugün\ndüşündüm"), "Bugün\ndüşündüm");
  assert.equal(normalizeMessageContent("Bir\n\nİki"), "Bir\n\nİki");
});

test("collapses two or more blank lines in a row to one", () => {
  assert.equal(normalizeMessageContent("Bir\n\n\nİki"), "Bir\n\nİki");
  assert.equal(normalizeMessageContent("Bir\n\n\n\n\n\nİki\n\n\n\nÜç"), "Bir\n\nİki\n\nÜç");
});

test("treats a line of only spaces or tabs as blank, and drops trailing spaces on every line", () => {
  assert.equal(normalizeMessageContent("Bir   \n  \t \n \n\t\nİki\t"), "Bir\n\nİki");
});

test("keeps leading spaces inside the text (the renderers collapse them)", () => {
  assert.equal(normalizeMessageContent("Bir\n  İki"), "Bir\n  İki");
});

test("turns CRLF, a lone CR and Unicode line/paragraph separators into \\n", () => {
  assert.equal(normalizeMessageContent("Bir\r\nİki\rÜç\u2028Dört\u2029Beş"), "Bir\nİki\nÜç\nDört\nBeş");
  assert.equal(normalizeMessageContent("Bir\r\n\r\n\r\n\r\nİki"), "Bir\n\nİki");
});

test("trims leading and trailing whitespace and line breaks of the whole text", () => {
  assert.equal(normalizeMessageContent("\n\n  Merhaba  \n\n\n"), "Merhaba");
});

test("is empty for whitespace and line breaks only", () => {
  assert.equal(normalizeMessageContent(" \n\t\r\n \u2028 "), "");
});

test("never lengthens the text and is idempotent", () => {
  for (const sample of ["a\r\n\r\n\r\nb", "  x \n\n\n y  ", "tek satır", "😀\n\n\n😀"]) {
    const once = normalizeMessageContent(sample);
    assert.ok([...once].length <= [...sample].length);
    assert.equal(normalizeMessageContent(once), once);
  }
});
