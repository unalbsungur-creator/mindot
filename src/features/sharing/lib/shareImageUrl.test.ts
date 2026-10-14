import assert from "node:assert/strict";
import { test } from "node:test";
import { shareFormats } from "../config/shareFormats";
import { noteShareImageUrl } from "./shareImageUrl";

test("the share page's image is always the note on its own, for every picker format", () => {
  for (const format of shareFormats.filter((entry) => entry.showInPicker !== false)) {
    assert.equal(noteShareImageUrl("msg-1", format.id), `/api/share/note/msg-1/${format.id}?mode=note_only`);
  }
});

test("never asks for the surrounding wall", () => {
  assert.doesNotMatch(noteShareImageUrl("msg-1", "story"), /note_with_surrounding/);
});

test("encodes the path segments", () => {
  assert.equal(noteShareImageUrl("a/b", "sq are"), "/api/share/note/a%2Fb/sq%20are?mode=note_only");
});
