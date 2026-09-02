import { ImageResponse } from "next/og";
import { getNoteTemplate } from "@/features/notes/config/templates";
import { PDF_COLORS, PDF_PAPER_COLORS } from "@/features/memories/services/pdfPalette";
import type { FrameTemplate } from "@/features/memories/config/frameTemplates";
import type { ShareFormat } from "../types";
import { BrandLockup, logoToneFor } from "./brandMarkSatori";
import { loadShareFonts, SHARE_FONT_FAMILY } from "./shareFonts";

const PRIMARY_CHARS_ALONE = 220;
const PRIMARY_CHARS_WITH_SURROUNDING = 150;
const SURROUNDING_EXCERPT_CHARS = 70;
const SURROUNDING_PER_ROW = 3;
const MAX_SURROUNDING = 6;

export interface ShareCardNote {
  content: string;
  templateId: string;
  authorName: string | null;
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
 * Renders one branded share card as a PNG. The single renderer behind
 * every share entry point (single note, wall region, Memory Project) —
 * see "Branded export architecture" in CLAUDE.md. A separate renderer
 * from `MemoryPdfDocument` only because PDF and raster-image are
 * fundamentally different output targets (`@react-pdf/renderer` vs
 * `next/og`'s Satori-based `ImageResponse`); both read the same
 * `noteTemplates`/`frameTemplates` registries and brand-mark data.
 */
export function renderShareCard({ primary, surrounding = [], format, frame, slogan }: ShareCardInput): ImageResponse {
  const hasSurrounding = surrounding.length > 0;
  const backgroundColor = frame?.background ?? PDF_COLORS.navy;
  const inkColor = frame?.ink ?? PDF_COLORS.surface;
  const logoTone = frame ? logoToneFor(frame.background) : "inverted";
  const showHeaderLogo = !frame || frame.logoPlacement === "corner";
  const showFooterLogo = frame?.logoPlacement === "footer";

  const primaryMax = hasSurrounding ? PRIMARY_CHARS_WITH_SURROUNDING : PRIMARY_CHARS_ALONE;
  const primaryFontSize = format.id === "story" ? (hasSurrounding ? 40 : 50) : hasSurrounding ? 34 : 44;
  const cardPadding = format.width * 0.045;
  const outerPadding = format.width * 0.07;
  const rows = chunk(surrounding.slice(0, MAX_SURROUNDING), SURROUNDING_PER_ROW);
  const rowWidth = format.width - outerPadding * 2;
  const surroundingCardWidth = (rowWidth - (SURROUNDING_PER_ROW - 1) * 16) / SURROUNDING_PER_ROW;

  return new ImageResponse(
    (
      <div
        style={{
          width: format.width,
          height: format.height,
          display: "flex",
          flexDirection: "column",
          background: backgroundColor,
          padding: outerPadding,
          fontFamily: SHARE_FONT_FAMILY,
        }}
      >
        <div style={{ display: "flex", justifyContent: "flex-end", height: format.width * 0.09 }}>
          {showHeaderLogo && <BrandLockup cell={format.width * 0.014} tone={logoTone} inkColor={inkColor} />}
        </div>

        <div style={{ display: "flex", flex: 1, flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 28 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              background: paperColorFor(primary.templateId),
              borderRadius: 20,
              padding: cardPadding,
              maxWidth: format.width * 0.82,
            }}
          >
            <span style={{ fontSize: primaryFontSize, lineHeight: 1.45, color: PDF_COLORS.ink }}>
              {truncate(primary.content, primaryMax)}
            </span>
            {primary.authorName && (
              <span style={{ marginTop: 22, fontSize: 22, color: PDF_COLORS.inkSoft }}>— {primary.authorName}</span>
            )}
          </div>

          {rows.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16, width: rowWidth }}>
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

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, height: format.width * 0.11, justifyContent: "flex-end" }}>
          {slogan && <span style={{ fontSize: 22, color: inkColor, opacity: 0.85 }}>{slogan}</span>}
          {showFooterLogo && <BrandLockup cell={format.width * 0.011} tone={logoTone} inkColor={inkColor} />}
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
