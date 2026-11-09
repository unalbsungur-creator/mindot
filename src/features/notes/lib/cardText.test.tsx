import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, it } from "node:test";
import { isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { estimateMemoryCardSize, MemoryNoteCard } from "@/features/sharing/services/noteCardSatori";
import { Note } from "../components/Note";
import { noteTemplates } from "../config/templates";
import type { NoteData, NoteTextFontFamily } from "../types";
import {
  BYLINE_MIN_SCALE,
  bylineReserve,
  cardTextGeometry,
  cardTextKind,
  fitBylineLine,
  HEIGHT_MARGIN,
  layoutCardText,
  measureCardText,
  SHARER_SCALE,
  wrapCardText,
  type CardBylineRows,
} from "./cardText";

const FONTS: NoteTextFontFamily[] = ["modern", "classic", "handwritten", "typewriter", "serif", "mono", "elegant", "bold"];
const FIXED = noteTemplates.filter((template) => cardTextKind(template) !== "growing");
const GROWING = noteTemplates.filter((template) => cardTextKind(template) === "growing");
const ROWS: CardBylineRows[] = [
  { main: true, sharer: false },
  { main: true, sharer: true },
];

/** 150 characters each: Turkish, long German words, ALL-CAPS Turkish. */
const LONG = [
  "Hayatta en hakiki mürşit ilimdir, fendir; ilim ve fennin haricinde mürşit aramak gaflettir, cehalettir, dalalettir. Sevgiyle kalın, aklınızda kalsın!!",
  "Geschwindigkeitsbegrenzungen und Verantwortungsbewusstsein sind wichtig, aber Freundschaft bleibt das Schönste im Leben. Viele liebe Grüße aus München",
  "BUGÜN ÇOK GÜZEL BİR GÜNDÜ VE SİZİNLE PAYLAŞMAK İSTEDİM ÇÜNKÜ HAYAT KISA, SEVGİ UZUN, DOSTLUK İSE SONSUZDUR. HEPİNİZİ ÇOK SEVİYORUM ARKADAŞLAR!!",
].map((text) => text.slice(0, 150));
const EIGHTY = "Bugün denize baktım, dalgalar sakindi ve bütün gün seni düşündüm, iyi ki varsın.".slice(0, 80);
const SHORT = ["Merhaba", "Saygı, Özlem ve Minnetle", "Seni seviyorum"];
const NAMES = ["Ali", "Ünal Büyüksungur", "Abdurrahman Muhammed Alparslan Yıldırımoğlu"]; // the last is 43 characters

describe("the glyph-width table", () => {
  it("matches the real font files it was generated from", () => {
    const fontkit = createRequire(import.meta.url)("fontkit");
    const files: Array<[NoteTextFontFamily, string]> = [
      ["modern", "NotoSans-Regular.woff"],
      ["bold", "NotoSans-Bold.woff"],
      ["classic", "Fraunces-Regular.woff"],
      ["serif", "Fraunces-SemiBold.woff"],
      ["handwritten", "Caveat-Regular.woff"],
      ["typewriter", "GeistMono-Regular.woff"],
    ];
    for (const [font, file] of files) {
      const face = fontkit.create(readFileSync(path.join(process.cwd(), "public/fonts/share", file)));
      for (const text of ["Saygı, Özlem ve Minnetle", "Ünal Büyüksungur", "GRÜẞE AUS MÜNCHEN — «ça»"]) {
        const expected = [...text].reduce((sum, ch) => sum + (face.hasGlyphForCodePoint(ch.codePointAt(0)) ? face.glyphForCodePoint(ch.codePointAt(0)).advanceWidth / face.unitsPerEm : 0), 0);
        const missing = [...text].filter((ch) => !face.hasGlyphForCodePoint(ch.codePointAt(0)));
        if (missing.length) continue; // a fallback-font character: covered by the next test
        // The table stores thousandths of an em: at most half a unit of rounding per character.
        assert.ok(Math.abs(measureCardText(text, font, 1) - expected) <= 0.0005 * [...text].length + 1e-9, `${font}: ${text}`);
      }
    }
  });

  it("counts a character no table covers (an emoji) as wide rather than zero", () => {
    assert.ok(measureCardText("🌍", "modern", 10) >= 10);
  });
});

describe("line breaking", () => {
  it("keeps the writer's own line breaks", () => {
    assert.deepEqual(wrapCardText("Bir\n\nİki", "modern", 12, 140), ["Bir", "", "İki"]);
  });

  it("never leaves one word alone on the last line when a narrower measure avoids it", () => {
    // Greedy breaking at this width would leave "dostlar." alone.
    const text = "Hayat kısa ama sevgi uzun, dostlar.";
    const width = measureCardText("Hayat kısa ama sevgi uzun,", "modern", 10) + 1;
    const lines = wrapCardText(text, "modern", 10, width);
    assert.equal(lines.length, 2);
    assert.ok(lines[1].split(" ").length >= 2, lines.join(" | "));
  });

  it("splits a word wider than the box instead of letting it overflow", () => {
    const lines = wrapCardText("Rindfleischetikettierungsüberwachungsaufgabenübertragungsgesetz", "modern", 12, 80);
    assert.ok(lines.length > 1);
    for (const line of lines) assert.ok(measureCardText(line, "modern", 12) <= 80, line);
  });
});

describe("the message size on fixed-box cards", () => {
  it("fits 150 characters at or above the card's minimum, on every template, font and signature", () => {
    for (const template of FIXED) {
      for (const fontFamily of FONTS) {
        for (const rows of ROWS) {
          for (const content of LONG) {
            const layout = layoutCardText({ templateId: template.id, content, fontFamily, rows });
            assert.ok(layout.fits, `${template.id} ${fontFamily} ${content.slice(0, 12)}`);
            assert.ok(layout.fontSize >= layout.geometry.minPx - 1e-9);
            assert.ok(layout.textHeight <= layout.geometry.box.height! - layout.bylineReserve + 1e-9, `${template.id} ${fontFamily}`);
            for (const line of layout.lines) assert.ok(measureCardText(line, fontFamily, layout.fontSize) <= layout.geometry.box.width, `${template.id} ${fontFamily}: ${line}`);
          }
        }
      }
    }
  });

  it("uses the largest size that fits — one step larger would overflow — and never more than the card's maximum", () => {
    for (const template of FIXED) {
      for (const fontFamily of FONTS) {
        for (const content of [...SHORT, EIGHTY, LONG[0]]) {
          const rows = { main: true, sharer: false };
          const layout = layoutCardText({ templateId: template.id, content, fontFamily, rows });
          assert.ok(layout.fontSize <= layout.geometry.maxPx + 1e-9);
          if (layout.fontSize < layout.geometry.maxPx - 1e-9) {
            const larger = layout.fontSize + 0.25;
            const lines = wrapCardText(content, fontFamily, larger, layout.geometry.box.width * 0.96);
            assert.ok(lines.length * larger * layout.lineHeight > (layout.geometry.box.height! - layout.bylineReserve) * HEIGHT_MARGIN, `${template.id} ${fontFamily}: ${content}`);
          }
        }
      }
    }
  });

  it("draws one to three words at the card's maximum, not larger", () => {
    for (const template of FIXED) {
      const layout = layoutCardText({ templateId: template.id, content: "Merhaba", fontFamily: "modern", rows: ROWS[0] });
      assert.equal(layout.fontSize, layout.geometry.maxPx, template.id);
    }
  });

  it("shrinks as the message grows: 1 word ≥ 3 words ≥ 80 characters ≥ 150 characters", () => {
    for (const template of FIXED) {
      for (const fontFamily of FONTS) {
        const sizes = ["Merhaba", "Seni çok seviyorum", EIGHTY, LONG[0]].map((content) => layoutCardText({ templateId: template.id, content, fontFamily, rows: ROWS[0] }).fontSize);
        for (let i = 1; i < sizes.length; i++) assert.ok(sizes[i] <= sizes[i - 1] + 1e-9, `${template.id} ${fontFamily}: ${sizes.join(" > ")}`);
      }
    }
  });
});

describe("growing cards", () => {
  it("keep their length-tier size (the board footprint is built on it)", () => {
    for (const template of GROWING) {
      assert.equal(layoutCardText({ templateId: template.id, content: "Merhaba", fontFamily: "modern", rows: ROWS[0] }).fontSize, 15.2);
      assert.equal(layoutCardText({ templateId: template.id, content: LONG[0], fontFamily: "modern", rows: ROWS[0] }).fontSize, 12);
    }
  });
});

describe("the signature", () => {
  it("is never larger than the smallest size the message can have on that card", () => {
    for (const template of noteTemplates) {
      for (const fontFamily of FONTS) {
        const geometry = cardTextGeometry(template, fontFamily, LONG[0]);
        assert.ok(geometry.bylinePx <= geometry.minPx + 1e-9, `${template.id} ${fontFamily}`);
      }
    }
  });

  it("stays on one line: shrinks to 80%, then ends in “…”", () => {
    for (const template of noteTemplates) {
      const geometry = cardTextGeometry(template, "modern");
      for (const name of NAMES) {
        const fit = fitBylineLine(`— ${name}`, geometry.bylinePx, geometry.bylineWidth);
        assert.ok(fit.px >= geometry.bylinePx * BYLINE_MIN_SCALE - 1e-9 && fit.px <= geometry.bylinePx);
        assert.ok(measureCardText(fit.text, "byline", fit.px) <= geometry.bylineWidth, `${template.id}: ${fit.text}`);
        if (fit.text !== `— ${name}`) {
          assert.ok(fit.text.endsWith("…"), fit.text);
          assert.ok(Math.abs(fit.px - geometry.bylinePx * BYLINE_MIN_SCALE) < 1e-9, "cut only after shrinking to 80%");
        }
      }
    }
  });

  it("keeps a short name whole at full size", () => {
    for (const template of noteTemplates) {
      const geometry = cardTextGeometry(template, "modern");
      assert.deepEqual(fitBylineLine("— Ali", geometry.bylinePx, geometry.bylineWidth), { text: "— Ali", px: geometry.bylinePx });
    }
  });

  it("draws a quote's “shared by” line smaller than its author line", () => {
    const geometry = cardTextGeometry(noteTemplates.find((template) => template.id === "standard-quote")!, "modern");
    const main = fitBylineLine("— Nâzım Hikmet", geometry.bylinePx, geometry.bylineWidth);
    const sharer = fitBylineLine("paylaşan: Ünal Büyüksungur", geometry.bylinePx * SHARER_SCALE, geometry.bylineWidth);
    assert.ok(sharer.px < main.px);
  });

  it("is reserved before the message is sized, so the message never runs into it", () => {
    const template = noteTemplates.find((t) => t.id === "standard-archive")!;
    const geometry = cardTextGeometry(template, "handwritten");
    assert.ok(bylineReserve(geometry, { main: true, sharer: true }) > bylineReserve(geometry, { main: true, sharer: false }));
    assert.equal(bylineReserve(geometry, { main: false, sharer: false }), 0);
  });
});

describe("the reported card: “Saygı, Özlem ve Minnetle — Ünal Büyüksungur”, handwriting", () => {
  for (const templateId of ["standard-archive", "vintage-cream"]) {
    it(`${templateId}: the message is large, the name one small line below it`, () => {
      const layout = layoutCardText({ templateId, content: "Saygı, Özlem ve Minnetle", fontFamily: "handwritten", rows: ROWS[0] });
      const byline = fitBylineLine("— Ünal Büyüksungur", layout.geometry.bylinePx, layout.geometry.bylineWidth);
      assert.equal(byline.text, "— Ünal Büyüksungur");
      assert.ok(byline.px < layout.fontSize, `${byline.px} < ${layout.fontSize}`);
      if (cardTextKind(noteTemplates.find((t) => t.id === templateId)!) !== "growing") assert.equal(layout.fontSize, layout.geometry.maxPx);
    });
  }
});

function note(overrides: Partial<NoteData>): NoteData {
  return {
    id: "n1",
    content: "Saygı, Özlem ve Minnetle",
    authorName: "Ünal Büyüksungur",
    templateId: "standard-archive",
    fontFamily: "handwritten",
    size: "md",
    rotation: 0,
    position: { top: "0%", left: "0%" },
    language: "tr",
    ...overrides,
  };
}

function satoriText(node: ReactNode): string[] {
  if (node === null || node === undefined || typeof node === "boolean") return [];
  if (typeof node === "string" || typeof node === "number") return [String(node)];
  if (Array.isArray(node)) return node.flatMap(satoriText);
  if (isValidElement(node)) {
    const { type, props } = node as { type: unknown; props: { children?: ReactNode } };
    if (typeof type === "function") return satoriText((type as (p: unknown) => ReactNode)(props));
    return satoriText(props.children);
  }
  return [];
}

describe("one rule on every surface", () => {
  it("the board/preview card (Note) and the share/PDF card (MemoryNoteCard) draw the same lines and signature", () => {
    for (const templateId of ["standard-archive", "celebration-spark", "sport-yellow-red", "vintage-cream"]) {
      const content = EIGHTY;
      const layout = layoutCardText({ templateId, content, fontFamily: "handwritten", rows: ROWS[0] });
      const dom = renderToStaticMarkup(<Note variant="static" note={note({ templateId, content })} />);
      // A growing card's DOM text is broken by the browser in the font it draws (its height must not outgrow
      // the board footprint); every fixed-box card draws the computed lines. The size is the same on both.
      const growing = cardTextKind(noteTemplates.find((t) => t.id === templateId)!) === "growing";
      assert.ok(dom.includes(growing ? content : layout.lines.join("\n")), `${templateId}: DOM`);
      assert.ok(dom.includes(`font-size:${Math.round((layout.fontSize / 176) * 100 * 1000) / 1000}cqw`), `${templateId}: DOM size`);
      assert.ok(dom.includes("— Ünal Büyüksungur"), `${templateId}: DOM signature`);
      const satori = satoriText(
        <MemoryNoteCard content={content} authorName="Ünal Büyüksungur" templateId={templateId} fontFamily="handwritten" rotation={0} width={600} artworkDataUri="data:image/png;base64," />
      );
      assert.ok(satori.includes(layout.lines.join("\n")), `${templateId}: Satori`);
      assert.ok(satori.includes("— Ünal Büyüksungur"), `${templateId}: Satori signature`);
    }
  });

  it("cuts a long name with “…” the same way on both", () => {
    const name = NAMES[2];
    const templateId = "sport-yellow-red";
    const geometry = cardTextGeometry(noteTemplates.find((t) => t.id === templateId)!, "modern");
    const expected = fitBylineLine(`— ${name}`, geometry.bylinePx, geometry.bylineWidth).text;
    assert.ok(expected.endsWith("…"));
    assert.ok(renderToStaticMarkup(<Note variant="static" note={note({ templateId, authorName: name, fontFamily: "modern" })} />).includes(expected));
    const satori = satoriText(<MemoryNoteCard content="Merhaba" authorName={name} templateId={templateId} fontFamily="modern" rotation={0} width={600} />);
    assert.ok(satori.includes(expected), satori.join(" | "));
  });

  it("keeps fixed shapes fixed in the share/PDF card: football square, heart 4:5, image cards their artwork's ratio", () => {
    for (const template of FIXED) {
      const short = estimateMemoryCardSize(template.id, "Merhaba", 600, "modern");
      const long = estimateMemoryCardSize(template.id, LONG[2], 600, "modern", true);
      assert.deepEqual(short, long, template.id);
    }
  });
});
