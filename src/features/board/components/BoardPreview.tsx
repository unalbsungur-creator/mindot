import { Note } from "@/features/notes/components/Note";
import { sampleNotes } from "@/features/notes/data/sampleNotes";
import type { NoteData } from "@/features/notes/types";

/**
 * A curated, hand-placed glimpse of the board by default (EPIC 001's
 * sample data) — the homepage preview is unchanged. Pass `notes` to render
 * real data instead, e.g. one board tile's worth of approved messages (see
 * app/board/page.tsx). This is still a static scatter, not the infinite
 * canvas engine — that's a future EPIC built on panning/zooming across
 * many tiles rather than rendering one tile's worth of fixed positions.
 */
export function BoardPreview({ notes = sampleNotes }: { notes?: NoteData[] }) {
  return (
    <div className="relative overflow-x-auto rounded-lg border border-border bg-surface p-6 sm:overflow-hidden sm:p-10">
      <div className="relative flex gap-5 sm:block sm:min-h-[760px]">
        {notes.map((note) => (
          <Note key={note.id} note={note} />
        ))}
      </div>
    </div>
  );
}
