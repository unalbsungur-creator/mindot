"use client";

import { BrandMark } from "@/components/brand/BrandMark";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { PageContainer } from "@/components/layout/PageContainer";
import { useLocale } from "@/i18n/LocaleProvider";

export function LoginPageContent() {
  const { dictionary } = useLocale();

  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center py-16">
      <PageContainer className="mx-auto flex w-full max-w-sm flex-col items-center gap-6">
        <BrandMark className="h-10" />

        <div className="flex w-full flex-col gap-1 text-center">
          <h1 className="font-display text-2xl font-medium text-navy">
            {dictionary.nav.myMindot}
          </h1>
        </div>

        <div className="flex w-full flex-col items-center gap-4 rounded-lg border border-border bg-surface p-8 shadow-card">
          <GoogleSignInButton redirectTo="/me" />
        </div>
      </PageContainer>
    </div>
  );
}
