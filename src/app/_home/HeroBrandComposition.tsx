import Image from "next/image";
import { Note } from "@/features/notes/components/Note";
import type { NoteData } from "@/features/notes/types";

const CORNER_WRAPPER_CLASSES = [
  "absolute -left-6 top-[6%] hidden w-32 lg:block lg:w-36",
  "absolute -right-4 top-[2%] hidden w-28 lg:block lg:w-32",
  "absolute -left-4 bottom-[10%] hidden w-28 lg:block lg:w-32",
  "absolute -right-6 bottom-[4%] hidden w-28 lg:block lg:w-32",
];

/**
 * The hero's central visual, and the homepage's only large-scale use of
 * the brand mark. The center is the official raster lockup (public/Mindot
 * Daire.png, a 500x500 circular badge with transparent corners), used at
 * its real aspect ratio via next/image — no filter/recolor applied to the
 * image itself. The ambient glow behind it and the ring lines around it
 * stay pure CSS/decoration, layered *behind* the image, never touching its
 * pixels.
 *
 * `notes` (up to 4, real `Note`s — variant="static", each positioned by
 * its own corner wrapper, the same idiom WallNotes already uses) are
 * resolved server-side by app/page.tsx from real, approved database
 * messages (EPIC: Ana Sayfadaki 4 Mesajın Yeni Yapısı) — this component no
 * longer imports a static placeholder array. Renders however many are
 * actually given (0–4) rather than assuming exactly 4, so a thin dataset
 * degrades gracefully instead of crashing. Hidden below `lg:` per the
 * responsive spec (a controlled reduction to zero on small screens, not a
 * cramped miniature).
 */
export function HeroBrandComposition({ notes, className }: { notes: NoteData[]; className?: string }) {
  return (
    <div className={`relative mx-auto aspect-square w-full max-w-[340px] ${className ?? ""}`}>
      {/* Faint orange ring lines, purely decorative. */}
      <div
        aria-hidden="true"
        className="absolute inset-[6%] rounded-full border border-orange/15"
      />
      <div
        aria-hidden="true"
        className="absolute inset-[16%] rounded-full border border-orange/15"
      />

      {/* Soft ambient glow behind the mark — CSS only, no image asset,
          layered under the logo so it never touches the logo's own pixels. */}
      <div
        aria-hidden="true"
        className="absolute inset-[20%] rounded-full bg-orange/30 blur-3xl motion-safe:animate-[hero-glow-pulse_6s_var(--ease-standard)_infinite]"
      />

      <div className="absolute inset-[22%] flex items-center justify-center motion-safe:animate-[hero-logo-float_7s_var(--ease-standard)_infinite]">
        <Image
          src="/Mindot Daire.png"
          alt="MINDOT"
          width={500}
          height={500}
          priority
          className="h-full w-full object-contain"
        />
      </div>

      {notes.slice(0, 4).map((note, index) => (
        <div key={note.id} className={CORNER_WRAPPER_CLASSES[index]}>
          <Note variant="static" note={note} />
        </div>
      ))}
    </div>
  );
}
