import { messageRepository } from "@/features/messages/repository";
import type { Message } from "@/features/messages/types";
import type { NoteData } from "@/features/notes/types";
import { getCacheKv, HOME_CACHE_KEY, HOME_CACHE_TTL_SECONDS, readThroughKvCache } from "@/lib/kvCache";
import { selectHomeHeroMessages, type HomeHeroMode } from "./heroSelection";

export interface HomeData {
  hero: { mode: HomeHeroMode; notes: NoteData[]; pinnedIds: string[] };
  activeCount: number;
}

function toHeroNoteData(message: Message): NoteData {
  return {
    id: message.id,
    content: message.content,
    authorName: message.authorName,
    templateId: message.templateId,
    fontFamily: message.fontFamily,
    textAlign: message.textAlign,
    isQuote: message.isQuote,
    quoteAuthor: message.quoteAuthor,
    size: "sm",
    rotation: message.rotation ?? 0,
    // Inert for variant="static" — see HeroBrandComposition/Note.
    position: { top: "0%", left: "0%" },
    language: message.language,
  };
}

/**
 * MB-01: the 4 most liked published cards (newest fill-ups), see
 * heroSelection.ts. The caller only invokes this when the database is
 * configured.
 */
async function loadHomeData(): Promise<HomeData> {
  const [selection, activeCount] = await Promise.all([
    selectHomeHeroMessages(messageRepository),
    messageRepository.countApproved(),
  ]);
  return {
    hero: { mode: selection.mode, notes: selection.messages.map(toHeroNoteData), pinnedIds: selection.pinnedIds },
    activeCount,
  };
}

/**
 * The homepage's database reads (hero cards + the active-card counter), served
 * from KV for 5 minutes. Without a cache every anonymous visit — bots
 * included — queried Neon and kept it awake. Moderation actions drop the key
 * (`invalidateKvCache([HOME_CACHE_KEY])`) so a newly approved or rejected card
 * shows up at once; likes and the like-driven hero order may lag up to the TTL.
 */
export function getHomeData(): Promise<HomeData> {
  return readThroughKvCache({
    kv: getCacheKv(),
    key: HOME_CACHE_KEY,
    ttlSeconds: HOME_CACHE_TTL_SECONDS,
    load: loadHomeData,
  });
}
