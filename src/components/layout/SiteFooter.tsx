"use client";

import Link from "next/link";
import { BrandMark } from "@/components/brand/BrandMark";
import { OnboardingReopenButton } from "@/features/onboarding/components/OnboardingReopenButton";
import { SOCIAL_LINKS } from "@/features/sharing/config/social";
import { useLocale } from "@/i18n/LocaleProvider";
import { PageContainer } from "./PageContainer";

const SOCIAL_LABELS: Record<keyof typeof SOCIAL_LINKS, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
};

export function SiteFooter() {
  const { dictionary } = useLocale();
  const socialEntries = (Object.entries(SOCIAL_LINKS) as [keyof typeof SOCIAL_LINKS, string | null][]).filter(
    ([, url]) => url
  );

  return (
    <footer className="border-t border-border/70 bg-canvas py-4">
      <PageContainer className="flex flex-col items-center gap-2 text-center sm:flex-row sm:justify-between sm:gap-4 sm:text-left">
        <BrandMark tone="brand" className="h-5 w-5 shrink-0" />
        <p className="text-xs text-ink-soft">{dictionary.footer.tagline}</p>
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 sm:justify-end">
          <nav aria-label="Legal" className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs sm:justify-end">
            <Link href="/privacy" className="text-ink-soft hover:text-navy">{dictionary.footer.privacy}</Link>
            <Link href="/terms" className="text-ink-soft hover:text-navy">{dictionary.footer.terms}</Link>
            <Link href="/community-guidelines" className="text-ink-soft hover:text-navy">{dictionary.footer.guidelines}</Link>
            {/* Reuses nav.about's own text rather than a second translated
                string for the same /about destination — a prior pass here
                introduced footer.howItWorks with the exact same copy as
                onboarding.reopenLabel ("MINDOT nasıl çalışır"), which made
                the footer visibly show that phrase twice for two different
                actions. Confirmed via a real rendered screenshot, not
                assumed. */}
            <Link href="/about" className="text-ink-soft hover:text-navy">{dictionary.nav.about}</Link>
            <OnboardingReopenButton className="text-ink-soft hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:rounded-sm" />
          </nav>
          {socialEntries.length > 0 && (
            <div className="flex gap-2">
              {socialEntries.map(([platform, url]) => (
                <a
                  key={platform}
                  href={url ?? undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-ink-soft hover:text-navy"
                >
                  {SOCIAL_LABELS[platform]}
                </a>
              ))}
            </div>
          )}
          <p className="text-xs text-ink-soft">&copy; {new Date().getFullYear()} MINDOT</p>
        </div>
      </PageContainer>
    </footer>
  );
}
