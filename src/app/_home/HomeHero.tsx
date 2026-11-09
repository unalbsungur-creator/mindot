"use client";

import Image from "next/image";
import { Button } from "@/components/ui/Button";
import { DotCtaButton } from "@/components/ui/DotCtaButton";
import { StarField } from "@/components/ui/StarField";
import { PageContainer } from "@/components/layout/PageContainer";
import type { NoteData } from "@/features/notes/types";
import { useLocale } from "@/i18n/LocaleProvider";
import { HeroBrandComposition } from "./HeroBrandComposition";
import { PointsMilestone } from "./PointsMilestone";
import { useHiddenMessageIds } from "@/features/blocks/hooks/useHiddenMessageIds";
import type { HomeHeroMode } from "./heroSelection";

/**
 * The homepage's dark navy hero — one of exactly two sections on the
 * homepage (see page.tsx), sized to fit a normal desktop viewport
 * alongside the header/MeaningStrip/footer with no vertical scroll (EPIC:
 * Single-Screen Homepage). Three columns on desktop:
 *
 *   LEFT   — the brand block: the wide official lockup (public/Mindot
 *            Logo Dikdörtgen1.png) stacked above the large circular D mark
 *            (public/D Logo.png).
 *   CENTER — the slogan, description and CTA, plus the 1,000,000-dot
 *            progress readout built on the real approved count (MB-01:
 *            the "living wall / a thought for humanity" framing and its
 *            badge were retired for the fixed "AKLINDA KALMASIN." slogan;
 *            the count now lives inside the progress sentence instead of a
 *            separate large numeral, so it isn't shown twice).
 *   RIGHT  — HeroBrandComposition: the large Mindot Daire.png atmosphere
 *            with real, database-resolved surrounding notes (EPIC: Ana
 *            Sayfadaki 4 Mesajın Yeni Yapısı — resolved server-side in
 *            page.tsx, passed down as `heroNotes`).
 *
 * `activeCount` and `heroNotes` are both fetched server-side (app/page.tsx)
 * — this stays a client component (useLocale for translated copy) but
 * carries no data-fetching of its own.
 *
 * EPIC 038: a static, decorative star-field atmosphere (`StarField`, see
 * src/components/ui/StarField.tsx) sits behind all of the above. Very low
 * opacity (~0.12) over the existing navy — the asset itself is never
 * swapped in at full strength, so MINDOT's own navy stays the dominant
 * tone.
 */
export function HomeHero({
  activeCount,
  heroNotes,
  heroMode,
  pinnedIds = [],
}: {
  activeCount: number;
  heroNotes: NoteData[];
  heroMode: HomeHeroMode;
  /** MB-01: the pinned cards among `heroNotes` (fixedMessages.ts) — kept in the first places. */
  pinnedIds?: string[];
}) {
  const { dictionary } = useLocale();

  // MB-01: the stored "anonymous" placeholder is translated by `Note` itself (CardByline).
  // User blocking: this page is one shared ISR render, so a signed-in
  // viewer's blocked authors are dropped here, client-side, after a
  // private lookup (see useHiddenMessageIds).
  const hiddenIds = useHiddenMessageIds(heroNotes.map((note) => note.id));
  const visibleHeroNotes = heroNotes.filter((note) => !hiddenIds.has(note.id));

  return (
    <section className="relative flex flex-1 flex-col justify-center overflow-hidden bg-navy py-8 sm:py-10 lg:py-10">
      <StarField opacity={0.12} />
      <PageContainer className="grid grid-cols-1 items-center gap-8 lg:grid-cols-[0.9fr_2.4fr_1.9fr] lg:gap-6">
        <div className="order-2 flex justify-center lg:order-1 lg:justify-start">
          {/* MB-01: the small "MINDOT" wordmark + tagline that sat above this was removed; the large D mark stays. */}
          <Image
            src="/D Logo.png"
            alt=""
            width={274}
            height={298}
            className="h-auto w-28 sm:w-32 lg:w-full"
          />
        </div>

        <div className="order-1 flex flex-col items-start gap-4 text-left lg:order-2">
          <h1 className="text-balance font-display text-4xl font-medium leading-[1.1] tracking-tight text-white sm:text-5xl lg:text-6xl">
            {dictionary.hero.heading}
          </h1>
          <p className="max-w-xl text-balance text-base leading-relaxed text-white/70 sm:text-lg">
            {dictionary.hero.description}
          </p>
          {/* The write CTA stays first; "Buy Tokens" is a plain, session-free link
              beside it, so this ISR page stays the same for every visitor. */}
          <div className="flex flex-wrap items-center gap-3">
            <DotCtaButton href="/write">{dictionary.hero.primaryCta}</DotCtaButton>
            <Button href="/tokens" variant="outline" size="sm">
              {dictionary.nav.buyTokens}
            </Button>
          </div>
          {/* EPIC: Homepage Hero + 1,000,000 Points Compact Layout — the
              1,000,000-dot goal lives inside the hero itself, not a
              separate section below it, so the first viewport stays short.
              No second CTA here; the button above already covers it. */}
          <PointsMilestone count={activeCount} />
        </div>

        <div className="order-3 flex flex-col items-center gap-3">
          <HeroBrandComposition notes={visibleHeroNotes} pinnedIds={pinnedIds} />
          {/* EPIC: "DUVAR'da en çok beğenilenler" — a small, secondary
              eyebrow caption naming what the 4 note cards above actually
              are (real, top-liked approved messages — see
              listTopLikedApproved in app/page.tsx), not a new section with
              its own heading weight. Same muted/uppercase caption idiom
              already used for secondary labels on dark surfaces elsewhere
              (e.g. MePageContent's boardPage.slogan caption). */}
          {/* MB-01: "latest" when fewer than 4 cards have likes (heroSelection.ts); no caption without cards. */}
          {visibleHeroNotes.length > 0 && (
            <p className="text-center text-xs font-medium uppercase tracking-wide text-white/50">
              {heroMode === "top-liked" ? dictionary.hero.topLikedLabel : dictionary.hero.latestLabel}
            </p>
          )}
        </div>
      </PageContainer>
    </section>
  );
}
