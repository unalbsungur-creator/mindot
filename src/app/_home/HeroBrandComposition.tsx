import Image from "next/image";
import { Note } from "@/features/notes/components/Note";
import type { NoteData } from "@/features/notes/types";
import { arrangeHeroSlots } from "./heroSlots";

/**
 * MB-01: the cards are two flowing columns (left: places 0 and 2, right:
 * 1 and 3 — `arrangeHeroSlots`), not four absolutely positioned corners.
 * Corners pinned to a fixed square let a long card grow into the card
 * above it; in a flex column the cards simply stack, so no card can ever
 * cover another, and a tall pair makes the composition taller instead.
 * `gap-4` (16px) keeps at least 8px of visible space even after each
 * card's own small rotation pushes a corner out a few pixels. The staggered
 * paddings keep the scattered look the corner offsets had.
 *
 * Below `lg:` the cards are shrunk with `zoom` (which, unlike `scale`,
 * shrinks their layout box too, so the no-overlap guarantee holds on
 * mobile as well) to fit the ~340px composition without horizontal scroll.
 */
const COLUMN_CLASSES = [
  "flex flex-col justify-between gap-4 pt-[6%] pb-[10%] -ml-1 lg:-ml-6",
  "flex flex-col justify-between gap-4 pt-[2%] pb-[4%] -mr-1 lg:-mr-6",
];
const CARD_ZOOM_CLASS = "max-lg:[zoom:0.62]";

/**
 * The hero's central visual, and the homepage's only large-scale use of
 * the brand mark. The center is the official raster lockup (public/Mindot
 * Daire.png; MB-01: `images/brand/mindot-circle.png`, the same badge without its baked-in Turkish tagline — a 500x500 circular badge with transparent corners), used at
 * its real aspect ratio via next/image — no filter/recolor applied to the
 * image itself. The ambient glow behind it and the ring lines around it
 * stay pure CSS/decoration, layered *behind* the image, never touching its
 * pixels.
 *
 * `notes` (up to 4, real `Note`s — variant="static", in two columns, see
 * `COLUMN_CLASSES`) are
 * resolved server-side by app/page.tsx from real, approved database
 * messages (EPIC: Ana Sayfadaki 4 Mesajın Yeni Yapısı) — this component no
 * longer imports a static placeholder array. Renders however many are
 * actually given (0–4) rather than assuming exactly 4, so a thin dataset
 * degrades gracefully instead of crashing. Visible at every breakpoint —
 * see `COLUMN_CLASSES`' doc comment for how mobile stays overflow-free.
 */
export function HeroBrandComposition({ notes, pinnedIds = [], className }: { notes: NoteData[]; pinnedIds?: string[]; className?: string }) {
  return (
    <div className={`relative mx-auto grid w-full max-w-[340px] ${className ?? ""}`}>
      {/* The square brand visual and the card columns share one grid cell:
          the cell is at least the square, and grows if the cards need more. */}
      <div className="relative col-start-1 row-start-1 aspect-square w-full self-center">
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
            src="/images/brand/mindot-circle.png"
            alt="MINDOT"
            width={500}
            height={500}
            priority
            className="h-full w-full object-contain"
          />
        </div>
      </div>

      {/* MB-01: pinned cards first ("Merhaba Dünya" top-left, the shortest card under it — heroSlots.ts). */}
      <div className="relative z-[1] col-start-1 row-start-1 flex justify-between gap-4">
        {[0, 1].map((column) => (
          <div key={column} className={COLUMN_CLASSES[column]}>
            {arrangeHeroSlots(notes, pinnedIds)
              .slice(0, 4)
              .filter((_, index) => index % 2 === column)
              .map((note) => (
                <div key={note.id} className={CARD_ZOOM_CLASS}>
                  <Note variant="static" note={note} />
                </div>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}
