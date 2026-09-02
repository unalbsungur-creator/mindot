import type { BoardTileMessage } from "@/features/board/types";
import { matchBrowserLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/translations";
import type { ShareCardNote } from "../services/shareCardRenderer";

/** Maps the public board contract straight into what the renderer needs — never re-derives author visibility itself. */
export function toShareCardNote(message: BoardTileMessage): ShareCardNote {
  return { content: message.content, templateId: message.templateId, authorName: message.author?.displayName ?? null };
}

/** The brand slogan already used on the board (`boardPage.slogan`), in the note's own written language rather than the viewer's — a share card is generated once and travels with the note. */
export function sloganForLanguage(language: string): string {
  return getDictionary(matchBrowserLocale(language)).boardPage.slogan;
}
