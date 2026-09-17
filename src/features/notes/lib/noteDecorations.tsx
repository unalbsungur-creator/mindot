import type { ReactNode } from "react";
import type { NoteDecoration } from "../types";

/**
 * EPIC: Kart Tasarımı / Önizleme / Duvar Görüntüsü Eşleştirme. Every
 * seasonal template's real artwork (config/templates.ts's `image`) is a
 * flattened TemplatePicker thumbnail with "Aa — Template Name" baked into
 * its pixels — it can never be reused as the live note's background
 * without the user's real message getting double-exposed under that
 * placeholder text (see that file's own doc comment). This is the
 * alternative: a multi-piece CSS/SVG decoration layer per occasion,
 * studied directly against each template's own thumbnail so the *character*
 * that made TemplatePicker's card recognizable (Birthday's balloons + cake,
 * Valentine's scattered hearts, Mother's Day's two floral corners, etc.)
 * survives into the live-content render (write-flow preview, board, world
 * tiles) — not just one small generic 20×20 corner glyph. Colors stay
 * within the existing design tokens (no hardcoded hex, no image assets),
 * exactly like the single-icon version this replaces.
 *
 * Every piece here is positioned with percentage insets (not fixed pixels)
 * so the whole composition scales with the card at every `NoteSize`, and
 * every piece is a *sibling* of Note.tsx's clipped shape wrapper (rendered
 * from the `<article>` level, same as `attachment`/the old single icon) —
 * never nested inside it, for the same clip-path-cropping reason documented
 * in Note.tsx itself.
 */

function ConfettiPiece({ className }: { className: string }) {
  return <span aria-hidden="true" className={className} />;
}

function BalloonCluster() {
  return (
    <svg aria-hidden="true" viewBox="0 0 34 40" className="absolute top-[1%] right-[3%] h-9 w-8">
      <path d="M9 15c0-6 4-10 9-10s9 4 9 10-4 12-9 15c-5-3-9-9-9-15Z" className="fill-navy-soft" />
      <path d="M18 30c1 1.5 1.5 3 .8 4.2-.6 1-.2 1.6.6 1.4.9-.2 1.6.6.9 1.6" className="fill-none stroke-ink-soft" strokeWidth="1" strokeLinecap="round" />
      <path d="M24 19c0-5 3.2-8.5 7-8.5s7 3.5 7 8.5-3.2 9.5-7 11.5c-3.8-2-7-6.5-7-11.5Z" className="fill-orange" transform="translate(-9 -3) scale(0.72)" />
    </svg>
  );
}

function BirthdayCake() {
  return (
    <svg aria-hidden="true" viewBox="0 0 34 30" className="absolute bottom-[2%] left-[2%] h-8 w-9">
      <rect x="3" y="16" width="28" height="11" rx="1.5" className="fill-paper-white stroke-ink-soft" strokeWidth="1" />
      <rect x="3" y="16" width="28" height="4" className="fill-orange-tint" />
      <rect x="6" y="9" width="7" height="8" rx="1" className="fill-paper-white stroke-ink-soft" strokeWidth="1" />
      <rect x="21" y="9" width="7" height="8" rx="1" className="fill-paper-white stroke-ink-soft" strokeWidth="1" />
      <line x1="9.5" y1="9" x2="9.5" y2="4" className="stroke-orange-ink" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M9.5 1.5c1 1 1 2-0 3-1-1-1-2 0-3Z" className="fill-orange" />
      <line x1="24.5" y1="9" x2="24.5" y2="4" className="stroke-orange-ink" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M24.5 1.5c1 1 1 2 0 3-1-1-1-2 0-3Z" className="fill-orange" />
    </svg>
  );
}

/** Birthday Confetti's reference scatters small pieces across the whole upper card, not one corner. */
function ConfettiScatter() {
  return (
    <>
      <ConfettiPiece className="absolute top-[6%] left-[10%] h-1.5 w-1.5 rounded-full bg-orange" />
      <ConfettiPiece className="absolute top-[16%] left-[42%] h-2 w-1 -rotate-[20deg] rounded-[1px] bg-navy-soft" />
      <ConfettiPiece className="absolute top-[4%] left-[58%] h-1.5 w-1.5 rounded-full bg-orange-soft" />
      <ConfettiPiece className="absolute top-[24%] left-[20%] h-1.5 w-2 rotate-[15deg] rounded-[1px] bg-navy-soft" />
      <ConfettiPiece className="absolute top-[30%] left-[50%] h-1.5 w-1.5 rounded-full bg-orange" />
    </>
  );
}

function SmallHeart({ className }: { className: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className={className}>
      <path d="M10 16.5S3.5 12.2 3.5 7.6C3.5 5 5.5 3 8 3c1 0 1.9.5 2 1.5C10.1 3.5 11 3 12 3c2.5 0 4.5 2 4.5 4.6 0 4.6-6.5 8.9-6.5 8.9Z" />
    </svg>
  );
}

/** Valentine's reference scatters several hearts along the card's lower-right edge, not a single one in a corner. */
function HeartsBorder() {
  return (
    <>
      <SmallHeart className="absolute bottom-[4%] right-[3%] h-5 w-5 fill-orange" />
      <SmallHeart className="absolute bottom-[16%] right-[12%] h-3.5 w-3.5 fill-orange-soft" />
      <SmallHeart className="absolute bottom-[1%] right-[16%] h-3 w-3 fill-orange-soft" />
      <SmallHeart className="absolute bottom-[24%] right-[2%] h-3 w-3 fill-orange" />
    </>
  );
}

function FloralCluster({ className }: { className: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className={className}>
      <circle cx="10" cy="6" r="2.2" className="fill-orange-soft" />
      <circle cx="14.5" cy="10" r="2.2" className="fill-orange-soft" />
      <circle cx="10" cy="14" r="2.2" className="fill-orange-soft" />
      <circle cx="5.5" cy="10" r="2.2" className="fill-orange-soft" />
      <circle cx="10" cy="10" r="2" className="fill-orange-ink" />
    </svg>
  );
}

/** Mother's Day Bloom's reference has floral clusters in two opposite corners, not one. */
function FloralCorners() {
  return (
    <>
      <FloralCluster className="absolute top-[2%] left-[2%] h-7 w-7" />
      <FloralCluster className="absolute bottom-[2%] right-[2%] h-7 w-7" />
    </>
  );
}

/** Father's Day Craft's reference is a dark folded ribbon tucked into the top-right corner, not a compass. */
function RibbonCornerFold() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 30" className="absolute top-0 right-[10%] h-7 w-6">
      <path d="M2 0h12l8 8v22l-10-6-10 6V0Z" className="fill-navy" />
      <path d="M14 0v8h8Z" className="fill-navy-soft" />
    </svg>
  );
}

function Snowflake({ className }: { className: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className={className} strokeWidth="1.4" strokeLinecap="round">
      <path d="M10 2v16M2.7 6l14.6 8M2.7 14l14.6-8" />
    </svg>
  );
}

/**
 * New Year Frost's reference has snowflakes at two corners plus a light
 * drift along the bottom edge. A third, smaller snowflake used to sit at
 * `top-[38%]` — inside the card's own text band — and visibly overlapped
 * the note's content on real QA (a short two-line message already reaches
 * that height); removed rather than repositioned, since the two corner
 * flakes plus `FrostDrift` already carry the occasion's character without
 * it.
 */
function FrostScatter() {
  return (
    <>
      <Snowflake className="absolute top-[3%] right-[5%] h-6 w-6 stroke-navy-soft" />
      <Snowflake className="absolute bottom-[10%] left-[5%] h-4 w-4 stroke-navy-soft" />
    </>
  );
}

/** Sits inside the shape wrapper (never overflows) — same "special-case first child" idiom as the existing polaroid/folded blocks in Note.tsx. */
export function FrostDrift() {
  return (
    <span
      aria-hidden="true"
      className="absolute inset-x-0 bottom-0 h-3 bg-paper-blue/70 [clip-path:polygon(0%_60%,15%_20%,32%_70%,50%_10%,68%_65%,85%_15%,100%_55%,100%_100%,0%_100%)]"
    />
  );
}

function Star({ className }: { className: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className={className}>
      <path d="M8 2c.35 2.6 1.15 3.4 3.7 3.75C9.15 6.1 8.35 6.9 8 9.5c-.35-2.6-1.15-3.4-3.7-3.75C6.85 5.4 7.65 4.6 8 2Z" />
    </svg>
  );
}

/** Graduation Honor's reference has the cap at top-left plus several small stars scattered bottom-right. */
function GraduationScatter() {
  return (
    <>
      <svg aria-hidden="true" viewBox="0 0 20 20" className="absolute -top-2 -left-2 h-6 w-6">
        <path d="M10 3 18 7l-8 4-8-4Z" className="fill-navy" />
        <path d="M6 9v3.5c0 1.1 1.8 2 4 2s4-.9 4-2V9L10 11Z" className="fill-navy-soft" />
        <path d="M17 7v4" className="stroke-orange" strokeWidth="1.4" strokeLinecap="round" />
        <circle cx="17" cy="11.6" r="1" className="fill-orange" />
      </svg>
      <Star className="absolute bottom-[6%] right-[8%] h-4 w-4 fill-orange-ink" />
      <Star className="absolute bottom-[16%] right-[18%] h-3 w-3 fill-orange-soft" />
      <Star className="absolute bottom-[2%] right-[22%] h-2.5 w-2.5 fill-orange-ink" />
    </>
  );
}

/** Celebration Spark's reference is a party horn at bottom-right shooting streamers upward. */
function PartyHorn() {
  return (
    <>
      <svg aria-hidden="true" viewBox="0 0 26 26" className="absolute bottom-[2%] right-[4%] h-7 w-7">
        <path d="M22 22 6 15c-1-3 1.5-6 4.5-5l11.5 12Z" className="fill-orange" />
        <circle cx="9" cy="15.5" r="1.4" className="fill-orange-tint" />
      </svg>
      <svg aria-hidden="true" viewBox="0 0 20 20" className="absolute bottom-[38%] right-[16%] h-3.5 w-3.5 fill-none stroke-navy-soft" strokeWidth="1.4" strokeLinecap="round">
        <path d="M4 16c3-2 2-6 6-8" />
      </svg>
      <svg aria-hidden="true" viewBox="0 0 20 20" className="absolute bottom-[42%] right-[6%] h-3.5 w-3.5 fill-none stroke-orange-ink" strokeWidth="1.4" strokeLinecap="round">
        <path d="M4 16c4-1 3-7 8-9" />
      </svg>
      <ConfettiPiece className="absolute bottom-[46%] right-[10%] h-1.5 w-1.5 rounded-full bg-orange" />
    </>
  );
}

function RibbonBow() {
  return (
    <svg aria-hidden="true" viewBox="0 0 30 20" className="absolute top-[2%] right-[3%] h-6 w-8">
      <path d="M15 10 3 3c-1.5 1-1.5 8 0 9L15 10Z" className="fill-orange-ink" />
      <path d="M15 10 27 3c1.5 1 1.5 8 0 9L15 10Z" className="fill-orange" />
      <circle cx="15" cy="10" r="2.6" className="fill-orange-ink" />
    </svg>
  );
}

/**
 * Congratulations Note's reference has a ribbon bow at top-right plus a
 * short diagonal ribbon band tucked into the bottom-left corner — a
 * corner accent, not a strip crossing the whole card. `w-2/3` here used to
 * reach far enough to cross under the note's own text on real QA;
 * shortened to stay a corner-only accent.
 */
function CongratulationsScatter() {
  return (
    <>
      <RibbonBow />
      <span
        aria-hidden="true"
        className="absolute -bottom-1 -left-1 h-2 w-1/5 origin-bottom-left -rotate-[24deg] bg-orange-ink/80"
      />
      <Star className="absolute top-[8%] left-[6%] h-3 w-3 fill-orange-soft" />
    </>
  );
}

const decorationLayouts: Record<NoteDecoration, ReactNode> = {
  confetti: (
    <>
      <ConfettiScatter />
      <BalloonCluster />
      <BirthdayCake />
    </>
  ),
  hearts: <HeartsBorder />,
  florals: <FloralCorners />,
  compass: <RibbonCornerFold />,
  snowflake: <FrostScatter />,
  "graduation-cap": <GraduationScatter />,
  sparkle: <PartyHorn />,
  stars: <CongratulationsScatter />,
};

/**
 * The one entry point Note.tsx renders for `template.decoration` — replaces
 * the earlier single fixed-corner icon. Returns `null` for an undefined
 * decoration so the caller can render it unconditionally.
 */
export function renderNoteDecoration(decoration: NoteDecoration | undefined): ReactNode {
  if (!decoration) return null;
  return decorationLayouts[decoration];
}
