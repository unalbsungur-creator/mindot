import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { getActiveNoteTemplates } from "../config/templates";
import { templateDisplayName } from "../lib/templateDisplayName";
import { getDictionary } from "@/i18n/translations";
import { HorizontalTemplateRail } from "./HorizontalTemplateRail";

// MB-01: the CSS-drawn cards' picker thumbnails are PNGs with the English
// name painted in; the rail draws the real card with the translated name.

describe("HorizontalTemplateRail thumbnails", () => {
  for (const locale of ["tr", "en", "de", "fr", "es"] as const) {
    it(`labels every CSS-drawn card in ${locale}, never with the English-labelled PNG`, () => {
      const dictionary = getDictionary(locale);
      const templates = getActiveNoteTemplates().filter((t) => t.category !== "sports");
      const html = renderToStaticMarkup(
        <HorizontalTemplateRail
          templates={templates}
          value={templates[0].id}
          onChange={() => {}}
          groupLabel="g"
          prevLabel="p"
          nextLabel="n"
          sportsAriaLabel={() => ""}
          templateName={(t) => templateDisplayName(t, dictionary)}
        />
      ).replace(/&#x27;/g, "'");
      const cssCards = templates.filter((t) => t.image && !t.contentArea);
      assert.ok(cssCards.length >= 14, "the 14 standard CSS cards");
      for (const t of cssCards) {
        assert.ok(html.includes(`— ${templateDisplayName(t, dictionary)}`), `${locale}: ${t.id}`);
        assert.ok(!html.includes(encodeURI(t.image!).replace(/%20/g, "%20")) && !html.includes(t.image!), `${locale}: ${t.id} still uses its labelled PNG`);
      }
    });
  }

  it("translates the names (TR differs from the English registry names)", () => {
    const tr = getDictionary("tr");
    const template = getActiveNoteTemplates().find((t) => t.id === "classic-yellow")!;
    assert.equal(templateDisplayName(template, tr), "Klasik Sarı Yapışkan Not");
    assert.notEqual(templateDisplayName(template, tr), template.name);
  });
});
