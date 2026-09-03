"use client";

import { PageContainer } from "@/components/layout/PageContainer";
import { WriteThoughtForm } from "@/features/messages/components/WriteThoughtForm";
import { useLocale } from "@/i18n/LocaleProvider";

interface WritePageContentProps {
  sessionUser: { name: string | null; email: string | null; image: string | null } | null;
  isSuspended?: boolean;
}

/**
 * Always renders `WriteThoughtForm`, whether or not `sessionUser` is set —
 * a signed-out visitor can compose their thought first and only reaches
 * Google sign-in (gated by the mandatory consent checkbox) once they try
 * to continue. See "Mandatory content-responsibility consent" in
 * CLAUDE.md; this used to hide the whole form behind a bare sign-in
 * prompt, which is exactly the "login before writing" order that EPIC
 * deliberately reversed.
 */
export function WritePageContent({ sessionUser, isSuspended = false }: WritePageContentProps) {
  const { dictionary } = useLocale();

  return (
    <PageContainer className="py-16">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 pb-8 text-center">
        <h1 className="font-display text-3xl font-medium text-navy sm:text-4xl">{dictionary.write.title}</h1>
        <p className="text-ink-soft">{dictionary.write.subtitle}</p>
      </div>
      <div className="mx-auto max-w-3xl">
        <WriteThoughtForm sessionUser={sessionUser} isSuspended={isSuspended} />
      </div>
    </PageContainer>
  );
}
