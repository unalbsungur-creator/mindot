"use client";

import Image from "next/image";
import { PageContainer } from "@/components/layout/PageContainer";
import { useLocale } from "@/i18n/LocaleProvider";

function InfinityIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 20" className="h-6 w-9 fill-none stroke-orange" strokeWidth={2.25}>
      <path d="M9 4C4.6 4 2 7 2 10s2.6 6 7 6c5 0 9-12 14-12 4.4 0 7 3 7 6s-2.6 6-7 6c-5 0-9-12-14-12Z" strokeLinecap="round" />
    </svg>
  );
}

function PeopleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 24" className="h-6 w-8 fill-none stroke-orange" strokeWidth={2}>
      <circle cx="12" cy="8" r="4.5" />
      <path d="M4 22c0-5 3.6-8 8-8s8 3 8 8" strokeLinecap="round" />
      <circle cx="23" cy="9" r="3.5" opacity="0.7" />
      <path d="M20.5 22c0-3.8 2-6.5 5.5-7" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 28" className="h-7 w-6 fill-none stroke-orange" strokeWidth={2}>
      <path d="M12 26s8-8.5 8-15a8 8 0 1 0-16 0c0 6.5 8 15 8 15Z" strokeLinejoin="round" />
      <circle cx="12" cy="11" r="3" />
    </svg>
  );
}

/**
 * The dark navy "meaning strip" directly beneath the hero — the second and
 * final section of the single-screen homepage (EPIC: MINDOT Ana Sayfa —
 * Tek Sayfalık Final Landing Page). Four columns, each a small icon plus a
 * two-line phrase whose second line is the orange-highlighted one. Same
 * two-part dictionary-key pattern as the hero heading (see
 * i18n/translations/types.ts's homeInfoBand) rather than splitting a
 * single translated string at runtime, so each locale's translator
 * controls where the emphasis line breaks.
 *
 * Deliberately one continuous surface, not four cards — no per-column
 * background/border, only thin vertical dividers between them (`lg:divide-x`).
 *
 * The first column's icon is the official circular lockup (public/Mindot
 * Daire.png) at a small, controlled size — a brand mark, not a full-size
 * logo. The other three stay hand-drawn topic icons (infinity/people/pin)
 * since they represent ideas, not the brand mark itself.
 */
export function MeaningStrip() {
  const { dictionary } = useLocale();
  const t = dictionary.homeInfoBand;

  const columns = [
    {
      icon: <Image src="/Mindot Daire.png" alt="" width={500} height={500} className="h-7 w-7 object-contain" />,
      line1: t.col1Line1,
      highlight: t.col1Highlight,
    },
    { icon: <InfinityIcon />, line1: t.col2Line1, highlight: t.col2Highlight },
    { icon: <PeopleIcon />, line1: t.col3Line1, highlight: t.col3Highlight },
    { icon: <PinIcon />, line1: t.col4Line1, highlight: t.col4Highlight },
  ];

  return (
    <section className="border-t border-white/10 bg-navy py-6 sm:py-7">
      <PageContainer>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4 lg:divide-x lg:divide-white/10">
          {columns.map((column, index) => (
            <div key={index} className="flex flex-col items-start gap-2 lg:px-6 lg:first:pl-0 lg:last:pr-0">
              <div className="flex h-7 items-center">{column.icon}</div>
              <p className="text-balance text-base font-medium leading-snug text-white/90">
                {column.line1} <span className="text-orange">{column.highlight}</span>
              </p>
            </div>
          ))}
        </div>
      </PageContainer>
    </section>
  );
}
