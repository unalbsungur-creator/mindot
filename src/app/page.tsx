import { messageRepository } from "@/features/messages/repository";
import type { Message } from "@/features/messages/types";
import type { NoteData } from "@/features/notes/types";
import { isDatabaseConfigured } from "@/lib/env";
import { HOME_FIXED_MESSAGE_IDS } from "./_home/fixedMessages";
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
    size: "sm",
    rotation: message.rotation ?? 0,
    // Inert for variant="static" — see HeroBrandComposition/Note.
    position: { top: "0%", left: "0%" },
    language: message.language,
  };
}

/**
 * EPIC: Ana Sayfadaki 4 Mesajın Yeni Yapısı. Two fixed messages (real,
 * already-approved rows — see fixedMessages.ts) plus enough top-liked
 * approved messages to reach 4 total, excluding the fixed ones so nothing
 * duplicates. If a fixed message has since become unavailable (archived),
 * its slot is silently absorbed into the dynamic count instead of leaving
 * a gap or throwing — the same graceful-fallback spirit as the board's
 * own reference-point protection.
 *
 * EPIC: Make Database Dependency Safe for Cloudflare Build — the caller
 * (`Home`, below) only invokes this when `isDatabaseConfigured()` is
 * true, so this function itself can assume the database is reachable;
 * it never needs its own fallback branch.
 */
async function getHomeHeroNotes(): Promise<NoteData[]> {
  const fixedResults = await Promise.all(HOME_FIXED_MESSAGE_IDS.map((id) => messageRepository.getById(id)));
  const fixedMessages = fixedResults.filter((message): message is Message => message !== null && message.status === "approved");

  const dynamicNeeded = 4 - fixedMessages.length;
  const excludeIds = fixedMessages.map((message) => message.id);
  const dynamicMessages = dynamicNeeded > 0 ? await messageRepository.listTopLikedApproved(excludeIds, dynamicNeeded) : [];

  return [...fixedMessages, ...dynamicMessages].map(toHeroNoteData);
}

/**
 * EPIC: MINDOT Ana Sayfa — Tek Sayfalık Final Landing Page. Exactly two
 * sections — Header/Footer are rendered once, in the root layout, not
 * here. Fetches real data (hero's 4 notes, live active-message count)
 * from small, indexed, limited queries — never a full-table
 * fetch-and-sort-in-JS.
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
  const [heroNotes, activeCount] = isDatabaseConfigured()
    ? await Promise.all([getHomeHeroNotes(), messageRepository.countApproved()])
    : [[] as NoteData[], 0];

  return (
    <>
      <HomeHero activeCount={activeCount} heroNotes={heroNotes} />
      <MeaningStrip />
    </>
  );
}
