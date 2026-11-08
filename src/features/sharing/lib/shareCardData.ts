import type { BoardTileMessage } from "@/features/board/types";
import { matchBrowserLocale } from "@/i18n/config";
import { quoteBylineLines } from "@/features/notes/lib/quoteByline";
import { getDictionary } from "@/i18n/translations";
import type { ShareCardNote } from "../services/shareCardRenderer";

/** Maps the public board contract straight into what the renderer needs — never re-derives author visibility itself. */
export function toShareCardNote(message: BoardTileMessage): ShareCardNote {
  return {
    content: message.content,
    templateId: message.templateId,
    fontFamily: message.fontFamily,
    textAlign: message.textAlign,
    // MB-01: worded in the note's own language, like the slogan — a share card travels with the note.
    quote: message.isQuote
      ? quoteBylineLines(message.quoteAuthor, message.author?.displayName ?? null, getDictionary(matchBrowserLocale(message.language)).quote)
      : null,
    authorName: message.author?.displayName ?? null,
    date: formatMemoryDate(message.createdAt),
  };
}

/**
 * `DD.MM.YYYY` from an already-real, already-public `createdAt` — the
 * Memory Print's one small metadata line (see CLAUDE.md's "Premium Memory
 * Print" notes: date only, never a time/UUID/template id/moderation
 * detail). Deliberately not locale-formatted (`toLocaleDateString`) —
 * this is a fixed, unambiguous print convention, not interface text, and
 * a share card is generated once and travels with the note regardless of
 * who later views it.
 */
function formatMemoryDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-");
  return `${day}.${month}.${year}`;
}

/** The brand slogan already used on the board (`boardPage.slogan`), in the note's own written language rather than the viewer's — a share card is generated once and travels with the note. */
export function sloganForLanguage(language: string): string {
  return getDictionary(matchBrowserLocale(language)).boardPage.slogan;
}

/** MB-01: the wordmark's tagline ("A thought. A dot. An endless story."), in the note's own language — the share masters no longer carry it baked in Turkish. */
export function taglineForLanguage(language: string): BrandTagline {
  return getDictionary(matchBrowserLocale(language)).hero.brandTagline;
}

export type BrandTagline = { lead: string; highlight: string; tail: string };
