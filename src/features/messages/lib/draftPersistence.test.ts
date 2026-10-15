import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { toNoteTextAlign } from "@/features/notes/lib/textAlign";
import { consumeWriteDraft, saveWriteDraft } from "./draftPersistence";

// A minimal in-memory localStorage — the module only uses getItem/setItem/removeItem.
const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, value),
  removeItem: (key: string) => void store.delete(key),
};

const draft = {
  content: "Bugün denize baktım.",
  templateId: "standard-classic",
  fontFamily: "modern" as const,
  isAnonymous: true,
  displayName: "",
  language: "tr" as const,
  consentAccepted: true,
  consentVersion: "1",
};

describe("write draft alignment", () => {
  beforeEach(() => store.clear());

  it("keeps the chosen alignment across the sign-in redirect", () => {
    saveWriteDraft({ ...draft, textAlign: "right" });
    assert.equal(consumeWriteDraft(undefined)?.textAlign, "right");
  });

  it("restores a draft saved before alignment existed as 'auto'", () => {
    store.set("mindot:write-draft:v1", JSON.stringify({ ...draft, savedAt: Date.now() }));
    const restored = consumeWriteDraft(undefined);
    assert.ok(restored);
    assert.equal(restored.textAlign, undefined);
    assert.equal(toNoteTextAlign(restored.textAlign), "auto");
  });

  it("reads a tampered stored value as 'auto'", () => {
    store.set("mindot:write-draft:v1", JSON.stringify({ ...draft, textAlign: "justify", savedAt: Date.now() }));
    assert.equal(toNoteTextAlign(consumeWriteDraft(undefined)?.textAlign), "auto");
  });
});
