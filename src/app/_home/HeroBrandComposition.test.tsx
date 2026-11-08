import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { NoteData } from "@/features/notes/types";
import { HeroBrandComposition } from "./HeroBrandComposition";

const note = (id: string, content: string, templateId = "warm-cream"): NoteData => ({
  id,
  content,
  authorName: "anonymous",
  templateId,
  size: "sm",
  rotation: 0,
  position: { top: "0%", left: "0%" },
});

describe("HeroBrandComposition (MB-01: cards never overlap)", () => {
  const notes = [
    note("pinned", "Merhaba Dünya", "standard-classic"),
    note("long", "Bugün denize baktım ve her şeyin yerli yerinde olduğunu hissettim, uzun uzun."),
    note("quote", "En iyi intikam, sana zarar verene benzememektir.", "standard-quote"),
    note("short", "Kısa."),
  ];
  const html = renderToStaticMarkup(<HeroBrandComposition notes={notes} pinnedIds={["pinned"]} />);

  it("lays the cards out in two flowing columns with a 32px gap (≥ 8px left after ±8° rotations) — no absolutely positioned card", () => {
    const columns = html.match(/<div class="flex flex-col justify-between gap-8[^"]*">/g) ?? [];
    assert.equal(columns.length, 2);
    assert.doesNotMatch(html, /absolute -left-|absolute -right-/, "no corner-pinned card wrappers");
  });

  it("keeps the pinned card first in the left column and every card exactly once", () => {
    const order = [...html.matchAll(/Merhaba Dünya|Bugün denize|En iyi intikam|Kısa\./g)].map((m) => m[0]);
    assert.equal(order[0], "Merhaba Dünya");
    assert.equal(order.length, 4);
    assert.equal(new Set(order).size, 4);
  });

  it("shrinks cards on small screens with zoom (layout-affecting), not scale", () => {
    assert.match(html, /max-lg:\[zoom:0\.62\]/);
    assert.doesNotMatch(html, /scale-50/);
  });
});
