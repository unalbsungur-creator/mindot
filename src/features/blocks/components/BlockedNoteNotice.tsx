"use client";

import Link from "next/link";
import { BrandMark } from "@/components/brand/BrandMark";
import { PageContainer } from "@/components/layout/PageContainer";
import { useLocale } from "@/i18n/LocaleProvider";

/**
 * Shown in place of a single named note (a direct /share or /memory link)
 * whose author the viewer has blocked. The note's content is never sent to
 * the client in this state; managing blocks happens on /me.
 */
export function BlockedNoteNotice() {
  const { dictionary } = useLocale();
  const t = dictionary.blocking;
  return (
    <div className="flex min-h-page-panel items-center justify-center py-16">
      <PageContainer className="mx-auto flex max-w-md flex-col items-center gap-3 text-center">
        <BrandMark className="h-10" />
        <h1 className="font-display text-2xl font-medium text-navy">{t.blockedNoteTitle}</h1>
        <p className="text-ink-soft">{t.blockedNoteBody}</p>
        <Link href="/me" className="inline-flex min-h-11 items-center text-sm font-medium text-navy underline-offset-4 hover:underline">
          {t.manageLink}
        </Link>
      </PageContainer>
    </div>
  );
}
