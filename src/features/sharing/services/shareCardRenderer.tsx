import { ImageResponse } from "next/og";
import { getNoteTemplate } from "@/features/notes/config/templates";
import { PDF_COLORS, PDF_PAPER_COLORS } from "@/features/memories/services/pdfPalette";
import type { FrameTemplate } from "@/features/memories/config/frameTemplates";
import type { ShareFormat } from "../types";
import { BrandLockup, logoToneFor, MemorySeal, MemoryWatermark } from "./brandMarkSatori";
import { estimateMemoryCardSize, MemoryNoteCard } from "./noteCardSatori";
import { BRAND_FONT_FAMILY, loadShareFonts, SHARE_FONT_FAMILY } from "./shareFonts";
import { getMasterContentRegion, getMasterSafeArea, loadShareMasterImage, type LoadedMasterImage, type MasterSafeArea } from "./shareMasterImages";

const SURROUNDING_EXCERPT_CHARS = 70;
const SURROUNDING_PER_ROW = 3;
const MAX_SURROUNDING = 6;

export interface ShareCardNote {
  content: string;
  templateId: string;
  authorName: string | null;
  /** `DD.MM.YYYY`, already formatted by the caller (see shareCardData.ts) — this renderer never touches a raw timestamp/UUID/template id. Optional: omitted entirely (not shown as "unknown") when unavailable. */
  date?: string | null;
}

/**
 * What a share card needs to render — deliberately not `BoardTileMessage`
 * or `MemoryProject` directly, so this renderer never has to know where
 * its input came from (a single public note, a wall-region capture, or a
 * Memory Project's framed output) or re-derive privacy rules itself. The
 * caller (an API route) is responsible for only ever passing data already
 * cleared through `getPublicMessageById`/`resolveCaptureRegion` — see
 * "Branded social sharing" in CLAUDE.md.
 */
export interface ShareCardInput {
  primary: ShareCardNote;
  surrounding?: ShareCardNote[];
  format: ShareFormat;
  /** A Memory Project's chosen frame — omitted for a plain board-note/wall-region share, which uses the default MINDOT navy card style. */
  frame?: FrameTemplate | null;
  /** Optional branded slogan line, in the note's own language — resolved by the caller from the Dictionary, since this renderer has no i18n context of its own. */
  slogan?: string | null;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

function paperColorFor(templateId: string): string {
  const template = getNoteTemplate(templateId);
  return PDF_PAPER_COLORS[template.paper] ?? PDF_PAPER_COLORS.white;
}

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

/**
 * Renders one branded "Memory Print" share card as a PNG — the single
 * renderer behind every share entry point (single note, wall region,
 * Memory Project) — see "Branded export architecture" in CLAUDE.md. A
 * separate renderer from `MemoryPdfDocument` only because PDF and
 * raster-image are fundamentally different output targets
 * (`@react-pdf/renderer` vs `next/og`'s Satori-based `ImageResponse`);
 * both read the same `noteTemplates`/`frameTemplates` registries and
 * brand-mark data.
 *
 * Two composition strategies, chosen per format — never two rendering
 * *systems*, just two branches of this one function, both still ending
 * in exactly one `ImageResponse`/`MemoryNoteCard` call site:
 *
 * - **Master background** (`renderWithMasterBackground`): Square and
 *   Story use the approved, fixed design supplied as real artwork —
 *   `public/images/share/mindot-share-{square,story}.png` — as a
 *   full-bleed background image. That artwork already contains the
 *   MINDOT header lockup, tagline, background watermark texture, and
 *   "Aklında kalmasın." + dot footer, so none of those are drawn a
 *   second time; only the note card(s) and the message's own date (the
 *   one piece generic artwork can't contain) are composited on top,
 *   inside a safe area measured directly from the files (see
 *   `shareMasterImages.ts`). Only for the frame-less default share
 *   (`!frame`) — a Memory Project's chosen `frame` still needs its own
 *   palette, which the master art doesn't have variants for.
 * - **Fully-drawn fallback** (`renderFullyDrawnShareCard`): every format
 *   without a master (Print, OG, and any Memory Project `frame`) keeps
 *   the entirely Satori-drawn composition this renderer already had —
 *   unchanged, still the validated design for those cases.
 */
export function renderShareCard(input: ShareCardInput): ImageResponse {
  const master = !input.frame ? loadShareMasterImage(input.format.id) : null;
  const safeArea = master ? getMasterSafeArea(input.format.id) : null;
  if (master && safeArea) {
    return renderWithMasterBackground(input, master, safeArea, getMasterContentRegion(input.format.id));
  }
  return renderFullyDrawnShareCard(input);
}

function renderWithMasterBackground(
  { primary, surrounding = [], format }: ShareCardInput,
  master: LoadedMasterImage,
  safeArea: MasterSafeArea,
  contentRegion: { top: number; bottom: number }
): ImageResponse {
  // Positions the master image so only its `contentRegion` slice (a
  // fraction of the *raw file's* own height) is ever visible, before the
  // usual "cover" scale-to-fill is applied — see shareMasterImages.ts's
  // doc comment for why this is necessary for Story specifically (real,
  // literal black bars baked into that file, not a hypothetical). When
  // `contentRegion` is the full frame (`{top:0,bottom:1}`, Square today),
  // this reduces to exactly the same math as a plain `object-fit: cover`
  // would produce — one code path for both, not a special case per format.
  const contentHeightFraction = contentRegion.bottom - contentRegion.top;
  const scaledFullHeight = format.height / contentHeightFraction;
  const scaledFullWidth = scaledFullHeight * (master.width / master.height);
  const masterOffsetY = -contentRegion.top * scaledFullHeight;
  const masterOffsetX = -(scaledFullWidth - format.width) / 2;

  const heroInsetX = format.width * safeArea.heroInsetX;
  const heroTop = format.height * safeArea.heroTop;
  const heroBottom = format.height * safeArea.heroBottom;
  const rows = chunk(surrounding.slice(0, MAX_SURROUNDING), SURROUNDING_PER_ROW);
  const rowWidth = format.width - heroInsetX * 2;
  const surroundingCardWidth = (rowWidth - (SURROUNDING_PER_ROW - 1) * 16) / SURROUNDING_PER_ROW;
  const sectionGap = format.width * 0.04;
  const surroundingReserve = rows.length > 0 ? rows.length * (format.width * 0.11) + sectionGap : 0;

  // Same "shrink to guarantee containment" technique as the fallback
  // renderer, bounded by the *measured* safe area instead of a generic
  // margin — plus an explicit 0.85 safety factor on top of that budget.
  // Without it, a card whose natural height exactly equals the available
  // band fills it edge-to-edge with zero breathing room, visually
  // touching the master's own header/footer bands (confirmed: a real
  // rendered case did exactly this before the factor was added) — the
  // fix isn't "make more room" (the measured safe area is already
  // correct), it's "never claim 100% of the room that exists".
  const availableCardHeight = Math.max(format.width * 0.15, (heroBottom - heroTop - surroundingReserve) * 0.85);
  let cardWidth = format.width * (1 - safeArea.heroInsetX * 2) * 0.86;
  let cardSize = estimateMemoryCardSize(primary.templateId, primary.content, cardWidth);
  if (cardSize.height > availableCardHeight) {
    cardWidth *= availableCardHeight / cardSize.height;
    cardSize = estimateMemoryCardSize(primary.templateId, primary.content, cardWidth);
  }

  return new ImageResponse(
    (
      <div style={{ position: "relative", width: format.width, height: format.height, display: "flex", overflow: "hidden", fontFamily: SHARE_FONT_FAMILY }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- server-generated composite, not an optimizable next/image asset */}
        <img
          src={master.dataUri}
          alt=""
          width={scaledFullWidth}
          height={scaledFullHeight}
          style={{ position: "absolute", top: masterOffsetY, left: masterOffsetX, width: scaledFullWidth, height: scaledFullHeight }}
        />

        <div
          style={{
            position: "absolute",
            left: heroInsetX,
            right: heroInsetX,
            top: heroTop,
            bottom: format.height - heroBottom,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: sectionGap,
          }}
        >
          <MemoryNoteCard content={primary.content} authorName={primary.authorName} templateId={primary.templateId} rotation={0} width={cardWidth} />

          {rows.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16, width: rowWidth, opacity: 0.82 }}>
              {rows.map((row, rowIndex) => (
                <div key={rowIndex} style={{ display: "flex", flexDirection: "row", gap: 16, justifyContent: "center" }}>
                  {row.map((note, noteIndex) => (
                    <div
                      key={noteIndex}
                      style={{
                        display: "flex",
                        width: surroundingCardWidth,
                        background: paperColorFor(note.templateId),
                        borderRadius: 12,
                        padding: 16,
                        boxShadow: "0 1px 2px rgba(32,29,24,0.05), 0 2px 6px rgba(32,29,24,0.06)",
                      }}
                    >
                      <span style={{ fontSize: 16, lineHeight: 1.35, color: PDF_COLORS.ink }}>{truncate(note.content, SURROUNDING_EXCERPT_CHARS)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* The one dynamic piece the master art can't contain — every
            other footer element ("Aklında kalmasın.", the dot) is
            already baked into the master image itself. Placed in the
            real measured gap between the hero area's own bottom and
            where the master's baked-in footer text visually starts —
            NOT below the dot: that only leaves a handful of px at the
            very bottom edge (confirmed by rendering it there first —
            the date collided directly with the dot). */}
        {primary.date && (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: heroBottom,
              height: format.height * safeArea.footerTextTop - heroBottom,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span style={{ fontSize: format.width * 0.011, color: PDF_COLORS.inkSoft, letterSpacing: 1 }}>{primary.date}</span>
          </div>
        )}
      </div>
    ),
    { width: format.width, height: format.height, fonts: loadShareFonts() }
  );
}

/**
 * The entirely Satori-drawn composition — a gallery-print layout (warm
 * paper field, generous whitespace, the note rendered as its real
 * shaped/decorated/rotated self via `MemoryNoteCard`, restrained
 * typographic branding). Used for every format without master artwork
 * (Print, OG) and for any Memory Project `frame`, whose own palette the
 * master art has no variant for.
 */
function renderFullyDrawnShareCard({ primary, surrounding = [], format, frame, slogan }: ShareCardInput): ImageResponse {
  const backgroundColor = frame?.background ?? PDF_COLORS.canvas;
  const inkColor = frame?.ink ?? PDF_COLORS.ink;
  const logoTone = frame ? logoToneFor(frame.background) : "brand";
  const showFooterLogo = frame?.logoPlacement === "footer";
  const showHeaderLogo = !showFooterLogo;

  // Every proportional constant below is expressed against the canvas's
  // *shorter* edge, not always its width. Square/Story/the Print master
  // are all width <= height, so this is a no-op for them (min == width,
  // unchanged from the original design). It matters for a format this
  // renderer doesn't control the shape of — `/memory/[messageId]/
  // opengraph-image.tsx` reuses this same renderer at the OG convention's
  // 1200x630 (a *wide, short* landscape) — where width-based margins
  // alone once summed to more than the entire canvas height, producing a
  // negative available-height budget that fed straight into
  // `MemoryNoteCard`'s clip-path math as a negative width/height and
  // corrupted the whole render (confirmed: a real, reproducible failure
  // against that exact route, not a hypothetical). Min-edge-based margins
  // keep every format's whitespace *proportionate to what actually fits*.
  const minEdge = Math.min(format.width, format.height);
  const outerPadding = minEdge * 0.08;
  const headerHeight = minEdge * 0.09;
  const footerHeight = minEdge * (primary.date ? 0.24 : 0.19);
  const sectionGap = minEdge * 0.05;
  const rows = chunk(surrounding.slice(0, MAX_SURROUNDING), SURROUNDING_PER_ROW);
  const rowWidth = format.width - outerPadding * 2;
  const surroundingCardWidth = (rowWidth - (SURROUNDING_PER_ROW - 1) * 16) / SURROUNDING_PER_ROW;
  const surroundingReserve = rows.length > 0 ? rows.length * (minEdge * 0.11) + sectionGap : 0;

  // The card is the hero: sized generously (62% of canvas width) but
  // never so large it could crowd the header/footer/whitespace it needs
  // to read as a print, not a screenshot — `estimateMemoryCardSize`'s
  // height is an exactly linear function of width (every term it adds is
  // itself proportional to the requested width), so a single proportional
  // shrink — not an iterative search — is enough to guarantee the whole
  // card fits inside the space actually available, satisfying "the whole
  // card must always be visible, never cropped" without per-format
  // special-casing. Floored at a small positive fraction of the canvas so
  // even a pathologically short/cramped format degrades to a small,
  // valid card rather than ever reaching zero/negative dimensions again.
  const availableCardHeight = Math.max(
    minEdge * 0.2,
    format.height - outerPadding * 2 - headerHeight - footerHeight - sectionGap * 2 - surroundingReserve
  );
  let cardWidth = format.width * 0.62;
  let cardSize = estimateMemoryCardSize(primary.templateId, primary.content, cardWidth);
  if (cardSize.height > availableCardHeight) {
    cardWidth *= availableCardHeight / cardSize.height;
    cardSize = estimateMemoryCardSize(primary.templateId, primary.content, cardWidth);
  }

  return new ImageResponse(
    (
      <div
        style={{
          position: "relative",
          width: format.width,
          height: format.height,
          display: "flex",
          flexDirection: "column",
          background: backgroundColor,
          padding: outerPadding,
          fontFamily: SHARE_FONT_FAMILY,
        }}
      >
        {/* EPIC: Premium Memory Print branding, level 1 — a fixed, very
            faint watermark behind everything else. First child so normal
            paint order puts every other element on top of it. */}
        <MemoryWatermark canvasWidth={format.width} tone={logoTone} />

        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: headerHeight }}>
          {showHeaderLogo && <BrandLockup cell={format.width * 0.011} tone={logoTone} inkColor={inkColor} />}
        </div>

        <div style={{ display: "flex", flex: 1, flexDirection: "column", alignItems: "center", justifyContent: "center", gap: sectionGap }}>
          <MemoryNoteCard
            content={primary.content}
            authorName={primary.authorName}
            templateId={primary.templateId}
            rotation={0}
            width={cardWidth}
          />

          {rows.length > 0 && (
            // EPIC: "Note + surrounding wall" composition — a receded
            // backdrop, not a second row of equally-weighted cards: lower
            // opacity and a flatter shadow than the hero card so these
            // read as context around the chosen thought, never competing
            // with it (still each note's own real paper color/template).
            <div style={{ display: "flex", flexDirection: "column", gap: 16, width: rowWidth, marginTop: sectionGap * 0.7, opacity: 0.82 }}>
              {rows.map((row, rowIndex) => (
                <div key={rowIndex} style={{ display: "flex", flexDirection: "row", gap: 16, justifyContent: "center" }}>
                  {row.map((note, noteIndex) => (
                    <div
                      key={noteIndex}
                      style={{
                        display: "flex",
                        width: surroundingCardWidth,
                        background: paperColorFor(note.templateId),
                        borderRadius: 12,
                        padding: 16,
                        boxShadow: "0 1px 2px rgba(32,29,24,0.05), 0 2px 6px rgba(32,29,24,0.06)",
                      }}
                    >
                      <span style={{ fontSize: 16, lineHeight: 1.35, color: PDF_COLORS.ink }}>
                        {truncate(note.content, SURROUNDING_EXCERPT_CHARS)}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, height: footerHeight, justifyContent: "flex-end" }}>
          {slogan && (
            <span style={{ fontFamily: BRAND_FONT_FAMILY, fontWeight: 600, fontSize: format.width * 0.02, color: inkColor, opacity: 0.9 }}>
              {slogan}
            </span>
          )}
          <div style={{ display: "flex", width: format.width * 0.014, height: format.width * 0.014, borderRadius: "50%", background: PDF_COLORS.orange }} />
          {primary.date && (
            <span style={{ fontSize: format.width * 0.013, color: inkColor, opacity: 0.55, letterSpacing: 1 }}>{primary.date}</span>
          )}
          {showFooterLogo && <BrandLockup cell={format.width * 0.011} tone={logoTone} inkColor={inkColor} />}
        </div>

        {/* EPIC: Premium Memory Print branding, level 2 — the small
            circular "seal", independent of the main lockup above/below,
            positioned in the canvas's own corner rather than the note's. */}
        <div style={{ position: "absolute", right: outerPadding * 0.6, bottom: outerPadding * 0.6, display: "flex" }}>
          <MemorySeal size={format.width * 0.045} tone={logoTone} ringColor={PDF_COLORS.border} backgroundColor={PDF_COLORS.surface} />
        </div>
      </div>
    ),
    {
      width: format.width,
      height: format.height,
      fonts: loadShareFonts(),
    }
  );
}

const WALL_NOTES_PER_ROW = 2;
const WALL_EXCERPT_CHARS = 90;
const WALL_MAX_NOTES = 6;

export interface WallShareCardNote {
  content: string;
  templateId: string;
}

/**
 * What a personal-wall share card needs — deliberately no avatar image
 * (same call as the note/memory cards above: no external-image fetch
 * inside Satori) and no per-note author line, since the whole card
 * already belongs to one identified person shown once in the header.
 */
export interface WallShareCardInput {
  displayName: string;
  notes: WallShareCardNote[];
  format: ShareFormat;
  slogan?: string | null;
}

/**
 * Renders a personal wall's branded share card — a curated grid of
 * several notes with equal visual weight, not one note+neighbors. A
 * second composition in this same renderer (same `ImageResponse`/Satori
 * infrastructure, same font loading, same `BrandLockup`/`paperColorFor`
 * helpers as `renderShareCard`) rather than a new rendering technology —
 * see "Personal wall sharing" in CLAUDE.md. The caller is responsible for
 * curating `notes` down to a small, deterministic set (see
 * features/profile/lib/curateWallSelection.ts) before this ever runs.
 */
export function renderWallShareCard({ displayName, notes, format, slogan }: WallShareCardInput): ImageResponse {
  const outerPadding = format.width * 0.07;
  const rows = chunk(notes.slice(0, WALL_MAX_NOTES), WALL_NOTES_PER_ROW);
  const rowWidth = format.width - outerPadding * 2;
  const cardWidth = (rowWidth - (WALL_NOTES_PER_ROW - 1) * 20) / WALL_NOTES_PER_ROW;

  return new ImageResponse(
    (
      <div
        style={{
          width: format.width,
          height: format.height,
          display: "flex",
          flexDirection: "column",
          background: PDF_COLORS.navy,
          padding: outerPadding,
          fontFamily: SHARE_FONT_FAMILY,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, marginBottom: 32 }}>
          <BrandLockup cell={format.width * 0.014} tone="inverted" inkColor={PDF_COLORS.surface} />
          <span style={{ fontSize: 26, color: PDF_COLORS.surface, opacity: 0.9 }}>{displayName}</span>
        </div>

        <div style={{ display: "flex", flex: 1, flexDirection: "column", justifyContent: "center", gap: 20 }}>
          {rows.map((row, rowIndex) => (
            <div key={rowIndex} style={{ display: "flex", flexDirection: "row", gap: 20, justifyContent: "center" }}>
              {row.map((note, noteIndex) => (
                <div
                  key={noteIndex}
                  style={{
                    display: "flex",
                    width: cardWidth,
                    background: paperColorFor(note.templateId),
                    borderRadius: 16,
                    padding: 22,
                  }}
                >
                  <span style={{ fontSize: 20, lineHeight: 1.4, color: PDF_COLORS.ink }}>
                    {truncate(note.content, WALL_EXCERPT_CHARS)}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "center", marginTop: 28 }}>
          {slogan && <span style={{ fontSize: 20, color: PDF_COLORS.surface, opacity: 0.75 }}>{slogan}</span>}
        </div>
      </div>
    ),
    {
      width: format.width,
      height: format.height,
      fonts: loadShareFonts(),
    }
  );
}
