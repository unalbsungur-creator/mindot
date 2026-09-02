"use client";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PageContainer } from "@/components/layout/PageContainer";
import { useLocale } from "@/i18n/LocaleProvider";

/**
 * The origin story, relocated here from the homepage (EPIC "Tek Sayfalık
 * Final Landing Page" — the homepage is now Hero + MeaningStrip only).
 * Reuses `dictionary.story` as-is rather than a duplicated `about` key:
 * the content didn't change, only where it's rendered — its heading is
 * now a real page `<h1>` instead of an in-page `<h2>`, since this is a
 * standalone route rather than a homepage section. The header's "Hakkında"
 * link and the hero's "Nereden başladı" button both point here.
 */
export function AboutPageContent() {
  const { dictionary } = useLocale();

  return (
    <PageContainer className="mx-auto flex max-w-2xl flex-col gap-6 py-16 sm:py-24">
      <Badge>{dictionary.story.badge}</Badge>
      <h1 className="font-display text-3xl font-medium text-navy sm:text-4xl">{dictionary.story.heading}</h1>
      <div className="space-y-4 text-ink-soft">
        {dictionary.story.paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
      <div>
        <Button href="/write" variant="secondary" size="md">
          {dictionary.hero.primaryCta}
        </Button>
      </div>
    </PageContainer>
  );
}
