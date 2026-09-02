"use client";

import Image from "next/image";
import { Badge } from "@/components/ui/Badge";
import { DotCtaButton } from "@/components/ui/DotCtaButton";
import { PageContainer } from "@/components/layout/PageContainer";
import type { NoteData } from "@/features/notes/types";
import { useLocale } from "@/i18n/LocaleProvider";
import { HeroBrandComposition } from "./HeroBrandComposition";

/**
 * The homepage's dark navy hero — one of exactly two sections on the
 * homepage (see page.tsx), sized to fit a normal desktop viewport
 * alongside the header/MeaningStrip/footer with no vertical scroll (EPIC:
 * Single-Screen Homepage). Three columns on desktop:
 *
 *   LEFT   — the brand block: the wide official lockup (public/Mindot
 *            Logo Dikdörtgen1.png) stacked above the large circular D mark
 *            (public/D Logo.png).
 *   CENTER — heading/description/CTA, plus the real active-message count
 *            (EPIC: Aktif Yayınlanmış Mesaj Sayacı — replaces the old
 *            static "Thousands have already joined" claim).
 *   RIGHT  — HeroBrandComposition: the large Mindot Daire.png atmosphere
 *            with real, database-resolved surrounding notes (EPIC: Ana
 *            Sayfadaki 4 Mesajın Yeni Yapısı — resolved server-side in
 *            page.tsx, passed down as `heroNotes`).
 *
 * `activeCount` and `heroNotes` are both fetched server-side (app/page.tsx)
 * — this stays a client component (useLocale for translated copy) but
 * carries no data-fetching of its own.
 */
export function HomeHero({ activeCount, heroNotes }: { activeCount: number; heroNotes: NoteData[] }) {
  const { locale, dictionary } = useLocale();

  return (
    <section className="relative overflow-hidden bg-navy py-8 sm:py-10 lg:py-10">
      <PageContainer className="grid grid-cols-1 items-center gap-8 lg:grid-cols-[0.9fr_2.4fr_1.9fr] lg:gap-6">
        <div className="order-2 flex flex-row items-center justify-center gap-6 lg:order-1 lg:flex-col lg:items-start lg:gap-5">
          <Image
            src="/Mindot Logo Dikdörtgen1.png"
            alt="MINDOT"
            width={1103}
            height={411}
            className="h-auto w-32 sm:w-36 lg:w-full"
          />
          <Image
            src="/D Logo.png"
            alt=""
            width={274}
            height={298}
            className="h-auto w-28 sm:w-32 lg:w-full"
          />
        </div>

        <div className="order-1 flex flex-col items-start gap-4 text-left lg:order-2">
          <Badge tone="onDark">{dictionary.hero.badge}</Badge>
          <h1 className="text-balance font-display text-3xl font-medium leading-[1.2] text-white sm:text-4xl lg:text-5xl">
            {dictionary.hero.heading}
            <br />
            <span className="text-orange">{dictionary.hero.headingHighlight}</span>
          </h1>
          <p className="max-w-xl text-balance text-base leading-relaxed text-white/70 sm:text-lg">
            {dictionary.hero.description}
          </p>
          <DotCtaButton href="/write">{dictionary.hero.primaryCta}</DotCtaButton>
          {/* EPIC: Ana Sayfada Gerçek Aktif Mesaj Sayacı — a genuine large
              numeral, not a small social-proof line (that framing, with
              decorative avatar circles, was explicitly what this EPIC
              asked to move away from). The number carries the visual
              weight; the label is a small caption beside it, never the
              other way around. */}
          <div className="flex items-baseline gap-2.5">
            <span className="font-display text-4xl font-semibold leading-none text-orange tabular-nums sm:text-5xl">
              {new Intl.NumberFormat(locale).format(activeCount)}
            </span>
            <span className="text-sm leading-tight text-white/60">{dictionary.hero.activeCountLabel}</span>
          </div>
        </div>

        <div className="order-3">
          <HeroBrandComposition notes={heroNotes} />
        </div>
      </PageContainer>
    </section>
  );
}
