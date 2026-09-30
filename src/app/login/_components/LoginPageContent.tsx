"use client";

import { BrandMark } from "@/components/brand/BrandMark";
import { SignInOptions } from "@/components/auth/SignInOptions";
import { PageContainer } from "@/components/layout/PageContainer";
import { useLocale } from "@/i18n/LocaleProvider";

export type LoginError = "generic" | "account-exists" | "apple-email-missing";

export function LoginPageContent({ error }: { error: LoginError | null }) {
  const { dictionary } = useLocale();
  const errorMessage =
    error === "account-exists"
      ? dictionary.login.errorAccountExists
      : error === "apple-email-missing"
        ? dictionary.login.errorAppleEmailMissing
        : error
          ? dictionary.login.errorGeneric
          : null;

  return (
    <div className="flex min-h-page-panel items-center justify-center py-16">
      <PageContainer className="mx-auto flex w-full max-w-sm flex-col items-center gap-6">
        <BrandMark className="h-10" />

        <div className="flex w-full flex-col gap-1 text-center">
          <h1 className="font-display text-2xl font-medium text-navy">
            {dictionary.nav.myMindot}
          </h1>
        </div>

        <div className="flex w-full flex-col items-center gap-4 rounded-lg border border-border bg-surface p-8 shadow-card">
          {errorMessage && (
            <p role="alert" className="text-center text-sm text-red-600">
              {errorMessage}
            </p>
          )}
          <SignInOptions redirectTo="/me" />
        </div>
      </PageContainer>
    </div>
  );
}
