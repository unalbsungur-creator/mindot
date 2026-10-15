import Link from "next/link";
import { Note } from "@/features/notes/components/Note";
import type { PersonalWallNote, PublicProfile } from "../types";

interface WallNotesProps {
  notes: PersonalWallNote[];
  profile: Pick<PublicProfile, "displayName" | "image">;
  emptyMessage: string;
  /**
   * The public wall only: makes each whole card a link to its own public
   * note page (`/share/[messageId]`) and returns that link's accessible
   * name for a card. Omitted on the owner's `/me` preview, which stays
   * plain cards. No new access path — every wall card is already an
   * approved note `/share` shows to anyone.
   */
  cardLinkLabel?: (note: PersonalWallNote) => string;
}

/**
 * The finite, non-spatial layout a personal wall renders as — reuses
 * `Note` (variant="static", the same "single note in normal document
 * flow" mode the write-flow preview and Memory pages already use) inside
 * a responsive flex-wrap, NOT `InfiniteBoard`. A user's own approved
 * messages are scattered across the *global* board wherever the spiral
 * placement algorithm happened to land them — they share no spatial
 * neighborhood with each other, so there's no coherent "personal tile
 * grid" to pan around; building one would mean inventing a second,
 * parallel placement system for no real benefit. See "Personal wall
 * architecture" in CLAUDE.md for the full reasoning.
 *
 * Each note repeats the wall owner's name/avatar (rather than omitting
 * attribution to reduce repetition) so this needs zero changes to `Note`
 * itself — every note here is already the shape a named board note is.
 */
export function WallNotes({ notes, profile, emptyMessage, cardLinkLabel }: WallNotesProps) {
  if (notes.length === 0) {
    return <p className="py-12 text-center text-sm text-ink-soft">{emptyMessage}</p>;
  }

  return (
    <div className="flex flex-wrap justify-center gap-6 px-2 py-6">
      {notes.map((note) => {
        const card = (
          <Note
            key={note.id}
            variant="static"
            note={{
              id: note.id,
              content: note.content,
              authorName: profile.displayName,
              authorImage: profile.image,
              templateId: note.templateId,
              fontFamily: note.fontFamily,
              textAlign: note.textAlign,
              size: "md",
              rotation: note.rotation,
              position: { top: "0%", left: "0%" },
              language: note.language,
            }}
          />
        );
        if (!cardLinkLabel) return card;
        // The whole card is one link: a single Tab stop and a single tap,
        // with nothing interactive nested inside (wall cards get no
        // `actions`). prefetch={false}: a page can hold 60 cards, and the
        // dynamic /share route shouldn't be fetched for each one on view or hover.
        return (
          <Link
            key={note.id}
            href={`/share/${encodeURIComponent(note.id)}`}
            prefetch={false}
            aria-label={cardLinkLabel(note)}
            className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-4 focus-visible:ring-offset-canvas"
          >
            {card}
          </Link>
        );
      })}
    </div>
  );
}
