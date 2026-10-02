import assert from "node:assert/strict";
import { test } from "node:test";
import { noteTemplates } from "@/features/notes/config/templates";
import { MESSAGE_MAX_LENGTH } from "../types";
import { maxMessageLength } from "./messageLength";

test("the global limit is still 150", () => {
  assert.equal(MESSAGE_MAX_LENGTH, 150);
});

test("standard-minimal is limited to 100 characters", () => {
  assert.equal(maxMessageLength("standard-minimal"), 100);
});

test("standard-classic and every card without its own limit keep 150", () => {
  assert.equal(maxMessageLength("standard-classic"), 150);
  const unlimited = noteTemplates.filter((template) => template.maxCharacters === undefined);
  assert.ok(unlimited.length >= 43);
  for (const template of unlimited) assert.equal(maxMessageLength(template.id), 150, template.id);
});

test("only standard-minimal sets its own limit", () => {
  assert.deepEqual(
    noteTemplates.filter((template) => template.maxCharacters !== undefined).map((template) => template.id),
    ["standard-minimal"]
  );
});
