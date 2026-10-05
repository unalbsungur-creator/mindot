import assert from "node:assert/strict";
import { test } from "node:test";
import { getNoteTemplate, noteTemplates } from "./templates";
import { defineStandardCard, STANDARD_CARD_MAX_CHARACTERS, STANDARD_CARD_SAFE_AREA } from "./standardCards";

const percent = (value: string) => Number.parseFloat(value);

test("defineStandardCard fills the shared Standard card rules", () => {
  assert.deepEqual(
    defineStandardCard({
      id: "standard-example",
      name: "Example",
      paper: "cream",
      image: "/images/standard/web/example.png",
      imageWidth: 600,
      imageHeight: 600,
      contentArea: STANDARD_CARD_SAFE_AREA.preferred,
    }),
    {
      id: "standard-example",
      name: "Example",
      paper: "cream",
      shape: "sticky",
      attachment: "none",
      font: "sans",
      category: "standard",
      enabled: true,
      image: "/images/standard/web/example.png",
      imageWidth: 600,
      imageHeight: 600,
      contentArea: STANDARD_CARD_SAFE_AREA.preferred,
      contentTextSize: "spacious",
      maxCharacters: 100,
    }
  );
  assert.equal(STANDARD_CARD_MAX_CHARACTERS, 100);
});

test("Minimal and Quote keep their exact registered values", () => {
  assert.deepEqual(getNoteTemplate("standard-minimal"), {
    id: "standard-minimal",
    name: "Minimal",
    paper: "blue",
    shape: "sticky",
    attachment: "none",
    font: "sans",
    category: "standard",
    enabled: true,
    image: "/images/standard/web/minimal.png",
    imageWidth: 600,
    imageHeight: 612,
    contentArea: { top: "8%", left: "8%", width: "84%", height: "76%" },
    contentTextSize: "spacious",
    maxCharacters: 100,
  });
  assert.deepEqual(getNoteTemplate("standard-quote"), {
    id: "standard-quote",
    name: "Quote",
    paper: "cream",
    shape: "sticky",
    attachment: "none",
    font: "sans",
    category: "standard",
    enabled: true,
    image: "/images/standard/web/quote.png",
    imageWidth: 600,
    imageHeight: 601,
    contentArea: { top: "15%", left: "10%", width: "80%", height: "70%" },
    contentTextSize: "spacious",
    maxCharacters: 100,
  });
});

test("Archive is registered with its approved values", () => {
  assert.deepEqual(getNoteTemplate("standard-archive"), {
    id: "standard-archive",
    name: "Archive",
    paper: "cream",
    shape: "sticky",
    attachment: "none",
    font: "sans",
    category: "standard",
    enabled: true,
    image: "/images/standard/web/archive.png",
    imageWidth: 500,
    imageHeight: 500,
    contentArea: { top: "14%", left: "10%", width: "80%", height: "72%" },
    contentTextSize: "spacious",
    maxCharacters: 100,
  });
});

test("Nature is registered with its approved values", () => {
  assert.deepEqual(getNoteTemplate("standard-nature"), {
    id: "standard-nature",
    name: "Nature",
    paper: "cream",
    shape: "sticky",
    attachment: "none",
    font: "sans",
    category: "standard",
    enabled: true,
    image: "/images/standard/web/nature.png",
    imageWidth: 500,
    imageHeight: 500,
    contentArea: { top: "14%", left: "10%", width: "80%", height: "72%" },
    contentTextSize: "spacious",
    maxCharacters: 100,
  });
});

test("Classic stays outside the redesign rules", () => {
  const classic = getNoteTemplate("standard-classic");
  assert.equal(classic.maxCharacters, undefined);
  assert.equal(classic.enabled, undefined);
  assert.deepEqual(classic.contentArea, { top: "8%", left: "8%", width: "84%", height: "68%" });
});

test("100-character Standard cards leave at least the minimum 80×70 text area", () => {
  const cards = noteTemplates.filter((template) => template.maxCharacters === STANDARD_CARD_MAX_CHARACTERS);
  assert.ok(cards.length >= 2);
  const minimum = STANDARD_CARD_SAFE_AREA.minimum;
  for (const card of cards) {
    assert.ok(card.contentArea, card.id);
    assert.ok(percent(card.contentArea.width) >= percent(minimum.width), card.id);
    assert.ok(percent(card.contentArea.height) >= percent(minimum.height), card.id);
    assert.ok(percent(card.contentArea.left) + percent(card.contentArea.width) <= 100, card.id);
    assert.ok(percent(card.contentArea.top) + percent(card.contentArea.height) <= 100, card.id);
  }
});

test("no template loads a Standard master instead of its web derivative", () => {
  for (const template of noteTemplates) {
    if (template.image?.startsWith("/images/standard/")) {
      assert.ok(template.image.startsWith("/images/standard/web/"), template.id);
    }
  }
});
