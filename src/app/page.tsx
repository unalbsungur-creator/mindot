import { messageRepository } from "@/features/messages/repository";
import type { Message } from "@/features/messages/types";
import type { NoteData } from "@/features/notes/types";
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
 * here. Now fetches real data (this EPIC): the hero's 4 notes and the
 * live active-message count, both from small, indexed, limited queries —
 * never a full-table fetch-and-sort-in-JS.
 */
export default async function Home() {
  const [heroNotes, activeCount] = await Promise.all([getHomeHeroNotes(), messageRepository.countApproved()]);

  return (
    <>
      <HomeHero activeCount={activeCount} heroNotes={heroNotes} />
      <MeaningStrip />
    </>
  );
}
