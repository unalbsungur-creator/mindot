import Image from "next/image";
import { Note } from "@/features/notes/components/Note";
import type { NoteData } from "@/features/notes/types";

/**
 * These were `hidden` below `lg:` entirely (desktop-only), which meant the
 * hero's 4 real top-liked notes never appeared on mobile at all. Now always
 * rendered: below `lg:` each note is pulled to a small inward offset and
 * scaled down (`scale-50` from the corner its own offset anchors, via
 * `origin-*`) so its otherwise-fixed 144px width (`Note`'s own `sizeClasses.sm`,
 * unrelated to this wrapper's own `w-*` class — not touched here) fits inside
 * the ~340px circle without pushing the page into horizontal scroll. `lg:`
 * values are byte-identical to the original desktop-only offsets/width, so
 * desktop rendering is unchanged.
 */
const CORNER_WRAPPER_CLASSES = [
  "absolute -left-2 top-[6%] w-32 origin-top-left scale-50 lg:-left-6 lg:w-36 lg:scale-100",
  "absolute -right-2 top-[2%] w-28 origin-top-right scale-50 lg:-right-4 lg:w-32 lg:scale-100",
  "absolute -left-2 bottom-[10%] w-28 origin-bottom-left scale-50 lg:-left-4 lg:w-32 lg:scale-100",
  "absolute -right-2 bottom-[4%] w-28 origin-bottom-right scale-50 lg:-right-6 lg:w-32 lg:scale-100",
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
 * degrades gracefully instead of crashing. Visible at every breakpoint —
 * see `CORNER_WRAPPER_CLASSES`' own doc comment for how mobile stays
 * overflow-free without a separate mobile-only layout.
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
