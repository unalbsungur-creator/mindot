import { Note } from "@/features/notes/components/Note";
import type { PersonalWallNote, PublicProfile } from "../types";

interface WallNotesProps {
  notes: PersonalWallNote[];
  profile: Pick<PublicProfile, "displayName" | "image">;
  emptyMessage: string;
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
export function WallNotes({ notes, profile, emptyMessage }: WallNotesProps) {
  if (notes.length === 0) {
    return <p className="py-12 text-center text-sm text-ink-soft">{emptyMessage}</p>;
  }

  return (
    <div className="flex flex-wrap justify-center gap-6 px-2 py-6">
      {notes.map((note) => (
        <Note
          key={note.id}
          variant="static"
          note={{
            id: note.id,
            content: note.content,
            authorName: profile.displayName,
            authorImage: profile.image,
            templateId: note.templateId,
            size: "md",
            rotation: note.rotation,
            position: { top: "0%", left: "0%" },
            language: note.language,
          }}
        />
      ))}
    </div>
  );
}
