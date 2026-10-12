import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { readImageSize } from "../lib/imageSize";
import { INSIDE_FOOTER_HEIGHT_PT, layoutPdfDownload, V2_PAGE_HEIGHT_PT, V2_PAGE_WIDTH_PT, type PdfRect } from "../lib/pdfDownloadLayout";
import {
  DEFAULT_PDF_BACKGROUND_ID,
  getPdfBackground,
  isPdfBackgroundId,
  parsePdfBackgroundParam,
  PDF_BACKGROUND_SIZE,
  pdfBackgrounds,
} from "./pdfBackgrounds";

const publicFile = (pathname: string) => path.join(process.cwd(), "public", pathname);

/** The five designer backgrounds added for V1, by catalog id → name and untouched master file. */
const NEW_DESIGNS: Record<string, { name: string; master: string }> = {
  neon: { name: "MINDOT Neon", master: "/images/pdf/mindot-neon.png" },
  "ivory-gold": { name: "Ivory Gold", master: "/images/pdf/mindot-ivory-gold.png" },
  "noir-silver": { name: "Noir Silver", master: "/images/pdf/mindot-noir-silver.png" },
  botanical: { name: "Botanical", master: "/images/pdf/mindot-botanical.png" },
  "soft-gradient": { name: "Soft Gradient", master: "/images/pdf/mindot-soft-gradient.png" },
};

test("the catalog lists the default design plus the five new ones, each id once", () => {
  const ids = pdfBackgrounds.map((background) => background.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(new Set(ids), new Set([DEFAULT_PDF_BACKGROUND_ID, ...Object.keys(NEW_DESIGNS)]));
  for (const [id, { name }] of Object.entries(NEW_DESIGNS)) assert.equal(getPdfBackground(id).name, name);
});

test("the default design is the original V2 artwork, so a download without a choice is unchanged", () => {
  const classic = getPdfBackground(DEFAULT_PDF_BACKGROUND_ID);
  assert.equal(classic.asset, "/images/pdf/mindot-pdf-background-v2-clean.png");
  assert.deepEqual(classic.cardWindow, { x: 219, y: 417, width: 586, height: 631 });
  assert.deepEqual(classic.footer, { placement: "below", frameBottom: 1062, gap: 30 });
  assert.equal(getPdfBackground(undefined).id, DEFAULT_PDF_BACKGROUND_ID);
  assert.equal(getPdfBackground("no-such-design").id, DEFAULT_PDF_BACKGROUND_ID);
});

test("the default design's page layout is exactly the pre-catalog V2 layout", () => {
  // Values the original renderer.tsx computed for a 720×720 card: window x 245 / y 443 px
  // inside a 534×579 px area at 0.5625 pt/px, slogan block 30pt under the frame (y 1062 px),
  // domain 46pt above the page foot.
  const layout = layoutPdfDownload(getPdfBackground(DEFAULT_PDF_BACKGROUND_ID), { width: 720, height: 720 });
  assert.deepEqual(layout.window, { left: 137.8125, top: 249.1875, width: 300.375, height: 325.6875 });
  assert.deepEqual(layout.card, { left: 137.8125, top: 261.84375, width: 300.375, height: 300.375 });
  assert.deepEqual(layout.footer, { placement: "below", left: 0, top: 627.375, width: 576, domainTop: 818 });
});

test("only catalog ids are accepted from a request", () => {
  for (const background of pdfBackgrounds) assert.equal(isPdfBackgroundId(background.id), true);
  for (const bad of ["", "Neon", "neon ", "__proto__", "constructor", "toString", "../neon", null, undefined, 1, {}]) {
    assert.equal(isPdfBackgroundId(bad), false, String(bad));
  }
});

test("every runtime asset exists at the measured size, in its declared format, and stays small", () => {
  for (const background of pdfBackgrounds) {
    const file = publicFile(background.asset);
    assert.ok(existsSync(file), background.asset);
    const size = readImageSize(readFileSync(file));
    assert.deepEqual(size, { format: background.assetFormat, ...PDF_BACKGROUND_SIZE }, background.asset);
    // The new designs ship a web derivative, never the multi-MB master.
    if (background.id !== DEFAULT_PDF_BACKGROUND_ID) assert.ok(statSync(file).size <= 500 * 1024, `${background.asset} is over 500 KB`);
  }
});

test("the designers' masters are kept, and only the derivatives are loaded", () => {
  for (const { master } of Object.values(NEW_DESIGNS)) {
    assert.ok(existsSync(publicFile(master)), master);
    assert.ok(!pdfBackgrounds.some((background) => background.asset === master), `${master} must not be the runtime asset`);
  }
});

test("every design has a small WebP thumbnail", () => {
  for (const background of pdfBackgrounds) {
    const bytes = readFileSync(publicFile(background.thumbnail));
    assert.equal(bytes.toString("ascii", 0, 4), "RIFF", background.thumbnail);
    assert.equal(bytes.toString("ascii", 8, 12), "WEBP", background.thumbnail);
    assert.ok(bytes.length <= 30 * 1024, `${background.thumbnail} is over 30 KB`);
  }
});

const within = (inner: PdfRect, outer: PdfRect, slack = 0.01) =>
  inner.left >= outer.left - slack &&
  inner.top >= outer.top - slack &&
  inner.left + inner.width <= outer.left + outer.width + slack &&
  inner.top + inner.height <= outer.top + outer.height + slack;

const page: PdfRect = { left: 0, top: 0, width: V2_PAGE_WIDTH_PT, height: V2_PAGE_HEIGHT_PT };

/** Card blocks pdfCardImage.tsx can produce: a lone card (720 wide, various heights) and a card with neighbour rows (936 wide). */
const CARD_SIZES = [
  { width: 720, height: 720 },
  { width: 720, height: 1100 },
  { width: 720, height: 400 },
  { width: 936, height: 1100 },
  { width: 936, height: 1480 },
];

test("each design's card window sits on the page, and the card never leaves it or the frame", () => {
  for (const background of pdfBackgrounds) {
    const { x, y, width, height } = background.cardWindow;
    assert.ok(x > 0 && y > 0 && x + width < PDF_BACKGROUND_SIZE.width && y + height < PDF_BACKGROUND_SIZE.height, background.id);
    for (const card of CARD_SIZES) {
      const layout = layoutPdfDownload(background, card);
      assert.ok(within(layout.window, page), `${background.id}: window off the page`);
      assert.ok(within(layout.card, layout.window), `${background.id} ${card.width}x${card.height}: card leaves the frame`);
      // Aspect ratio is kept and the card is never upscaled past 0.5pt/px.
      assert.ok(Math.abs(layout.card.width / layout.card.height - card.width / card.height) < 1e-9);
      assert.ok(layout.card.width <= card.width * 0.5 + 1e-9);
    }
  }
});

test("the slogan/date/domain block never overlaps the card or leaves the frame or page", () => {
  for (const background of pdfBackgrounds) {
    for (const card of CARD_SIZES) {
      const layout = layoutPdfDownload(background, card);
      const cardBottom = layout.card.top + layout.card.height;
      if (layout.footer.placement === "inside") {
        assert.equal(layout.footer.box.height, INSIDE_FOOTER_HEIGHT_PT);
        assert.ok(layout.footer.box.top >= cardBottom, `${background.id}: text overlaps the card`);
        assert.ok(within(layout.footer.box, layout.window), `${background.id} ${card.width}x${card.height}: text leaves the frame`);
      } else {
        const frameBottomPt = (background.footer.placement === "below" ? background.footer.frameBottom : 0) * (V2_PAGE_WIDTH_PT / PDF_BACKGROUND_SIZE.width);
        assert.ok(layout.footer.top > frameBottomPt && layout.footer.top > cardBottom, `${background.id}: text starts inside the frame`);
        // The below block is ~84pt tall (rule 2 + 16 + slogan ~20 + 16 + 6 + 14 + date ~9) and must clear the domain line.
        assert.ok(layout.footer.top + 84 < layout.footer.domainTop, `${background.id}: slogan block runs into the domain`);
        assert.ok(layout.footer.domainTop + 10 < V2_PAGE_HEIGHT_PT, `${background.id}: domain off the page`);
      }
    }
  }
});

test("a design keeps the card readable — the window never shrinks a lone card below ~250pt wide", () => {
  for (const background of pdfBackgrounds) {
    const layout = layoutPdfDownload(background, { width: 720, height: 720 });
    assert.ok(layout.card.width >= 250, `${background.id}: card only ${layout.card.width.toFixed(0)}pt wide`);
  }
});

test("the six designs, by id and picker name, each with its own artwork", () => {
  assert.deepEqual(
    pdfBackgrounds.map((background) => [background.id, background.name]),
    [
      ["classic", "MINDOT Classic"],
      ["neon", "MINDOT Neon"],
      ["ivory-gold", "Ivory Gold"],
      ["noir-silver", "Noir Silver"],
      ["botanical", "Botanical"],
      ["soft-gradient", "Soft Gradient"],
    ]
  );
  assert.equal(new Set(pdfBackgrounds.map((background) => background.asset)).size, 6);
  for (const background of pdfBackgrounds) assert.equal(getPdfBackground(background.id), background);
});

test("?background=: absent → default design, each catalog id → itself, anything else → rejected", () => {
  assert.deepEqual(parsePdfBackgroundParam(null), { ok: true, backgroundId: null });
  assert.equal(getPdfBackground(null).id, DEFAULT_PDF_BACKGROUND_ID);
  for (const background of pdfBackgrounds) {
    assert.deepEqual(parsePdfBackgroundParam(background.id), { ok: true, backgroundId: background.id });
  }
  for (const bad of ["", "Classic", "NEON", " neon", "neon ", "ivory_gold", "__proto__", "constructor", "../classic", "classic,neon", "%6Eeon"]) {
    assert.deepEqual(parsePdfBackgroundParam(bad), { ok: false }, JSON.stringify(bad));
  }
});

test("the download route rejects a bad ?background= with 400 before auth or any lookup, and renders only the parsed id", () => {
  // The route imports next-auth and the PDF renderer, which this runner can't load,
  // so this reads its source: the parse, its 400, and the order of the checks.
  const source = readFileSync(path.join(process.cwd(), "src/app/api/memories/[projectId]/download/route.ts"), "utf-8");
  const parse = source.indexOf('parsePdfBackgroundParam(searchParams.get("background"))');
  const reject = source.indexOf('{ error: "invalid-background" }, { status: 400 }');
  const authCall = source.indexOf("await auth()");
  const lookup = source.indexOf("memoryRepository.getById(");
  const access = source.indexOf("checkMemoryOutputAccess(");
  const render = source.indexOf("generateMemoryPdf(project, { backgroundId })");
  for (const [name, index] of Object.entries({ parse, reject, authCall, lookup, access, render })) assert.ok(index > 0, `${name} not found`);
  assert.ok(parse < reject && reject < authCall && authCall < lookup && lookup < access && access < render);
  assert.doesNotMatch(source, /searchParams\.get\("background"\)(?![)])/, "the raw query value is never used directly");
});
