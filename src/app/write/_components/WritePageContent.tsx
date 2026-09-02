"use client";

import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { PageContainer } from "@/components/layout/PageContainer";
import { WriteThoughtForm } from "@/features/messages/components/WriteThoughtForm";
import { useLocale } from "@/i18n/LocaleProvider";

interface WritePageContentProps {
  sessionUser: { name: string | null; email: string | null; image: string | null } | null;
}

export function WritePageContent({ sessionUser }: WritePageContentProps) {
  const { dictionary } = useLocale();

  return (
    <PageContainer className="py-16">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 pb-8 text-center">
        <h1 className="font-display text-3xl font-medium text-navy sm:text-4xl">{dictionary.write.title}</h1>
        <p className="text-ink-soft">{dictionary.write.subtitle}</p>
      </div>
      {sessionUser ? (
        <div className="mx-auto max-w-3xl">
          <WriteThoughtForm sessionUser={sessionUser} />
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 pt-4 text-center">
          <p className="text-ink-soft">{dictionary.write.signInRequired}</p>
          <GoogleSignInButton redirectTo="/write" />
        </div>
      )}
    </PageContainer>
  );
}
