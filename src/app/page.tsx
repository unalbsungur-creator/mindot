import { messageRepository } from "@/features/messages/repository";
import type { Message } from "@/features/messages/types";
import type { NoteData } from "@/features/notes/types";
import { isDatabaseConfigured } from "@/lib/env";
import { selectHomeHeroMessages, type HomeHeroMode } from "./_home/heroSelection";
import { HomeHero } from "./_home/HomeHero";
import { MeaningStrip } from "./_home/MeaningStrip";

// EPIC: Ana Sayfa Dinamik Mesajları / Aktif Mesaj Sayacı — real database
// data, refreshed periodically rather than on every single request (the
// homepage doesn't need millisecond freshness, and this keeps the page
// effectively static/cached the rest of the time — see the Performans
// section of that EPIC).
export const revalidate = 60;

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
 * MB-01: the 4 most liked published cards from the Wall, filled up with
 * the newest ones when fewer than 4 have likes (see heroSelection.ts —
 * this replaced the two pinned message ids of "Ana Sayfadaki 4 Mesajın
 * Yeni Yapısı"). The caller only invokes this when the database is
 * configured.
 */
async function getHomeHeroNotes(): Promise<{ mode: HomeHeroMode; notes: NoteData[]; pinnedIds: string[] }> {
  const { mode, messages, pinnedIds } = await selectHomeHeroMessages(messageRepository);
  return { mode, notes: messages.map(toHeroNoteData), pinnedIds };
}

/**
 * EPIC: MINDOT Ana Sayfa — Tek Sayfalık Final Landing Page. Exactly two
 * sections — Header/Footer are rendered once, in the root layout, not
 * here. Fetches real data (hero's 4 notes, live active-message count)
 * from small, indexed, limited queries — never a full-table
 * fetch-and-sort-in-JS. The same `activeCount` also drives the hero's
 * compact 1,000,000-dot milestone readout (see HomeHero/PointsMilestone)
 * — one query, two displays, no separate section for it.
 *
 * EPIC: Make Database Dependency Safe for Cloudflare Build — this page
 * uses ISR (`export const revalidate` above), so it's prerendered at
 * `next build` time, not just at request time. `isDatabaseConfigured()`
 * is checked *before* either database call — when DATABASE_URL genuinely
 * isn't set yet (a fresh deployment target whose production database
 * hasn't been provisioned), the page renders with an honest empty/zero
 * state instead of the build crashing. `getDb()`/`requireRuntimeEnv`
 * themselves are unchanged: once a real DATABASE_URL is configured, this
 * same code path calls them exactly as before and a genuine query error
 * still surfaces normally, not swallowed.
 */
export default async function Home() {
  const [hero, activeCount] = isDatabaseConfigured()
    ? await Promise.all([getHomeHeroNotes(), messageRepository.countApproved()])
    : [{ mode: "latest" as const, notes: [] as NoteData[], pinnedIds: [] as string[] }, 0];

  // MB-01: <main> is flex-1 and fills the viewport; without this wrapper the
  // two sections kept their own height and the canvas showed as an empty
  // band above the footer. The hero takes up the remaining height instead.
  return (
    <div data-fill-main="" className="flex flex-1 flex-col bg-navy">
      <HomeHero activeCount={activeCount} heroNotes={hero.notes} heroMode={hero.mode} pinnedIds={hero.pinnedIds} />
      <MeaningStrip />
    </div>
  );
}
