import { getNoteTemplate } from "@/features/notes/config/templates";
import { MESSAGE_MAX_LENGTH } from "../types";

/**
 * The longest message (in code points, `[...content].length`) a card
 * accepts: its own `maxCharacters` when set (the new illustrated Standard
 * cards — 100 in V1), otherwise the global `MESSAGE_MAX_LENGTH` (150) every
 * other card keeps. Never above the global limit. Shared by the write form,
 * the archive edit dialog and both server actions, so client and server
 * always agree; the server check is the actual boundary.
 */
export function maxMessageLength(templateId: string): number {
  const own = getNoteTemplate(templateId).maxCharacters;
  return own && own > 0 ? Math.min(own, MESSAGE_MAX_LENGTH) : MESSAGE_MAX_LENGTH;
}
