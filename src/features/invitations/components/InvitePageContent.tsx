"use client";

import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { MindotLogo } from "@/components/brand/MindotLogo";
import { PageContainer } from "@/components/layout/PageContainer";
import { WriteThoughtForm } from "@/features/messages/components/WriteThoughtForm";
import { useLocale } from "@/i18n/LocaleProvider";
import type { Dictionary } from "@/i18n/translations";
import type { InvitationStatus } from "../types";

interface InvitePageContentProps {
  token: string;
  /** null means no invitation was found for this token at all. */
  status: InvitationStatus | null;
  sessionUser: { name: string | null; email: string | null; image: string | null } | null;
}

export function InvitePageContent({ token, status, sessionUser }: InvitePageContentProps) {
  const { dictionary } = useLocale();

  if (status === null) {
    return <StateScreen title={dictionary.invite.invalidTitle} body={dictionary.invite.invalidBody} />;
  }

  if (status !== "active") {
    const copy = inactiveStateCopy(dictionary)[status];
    return <StateScreen title={copy.title} body={copy.body} />;
  }

  if (sessionUser) {
    return (
      <PageContainer className="py-16">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 pb-8 text-center">
          <MindotLogo layout="symbol" className="h-10 w-10" />
          <h1 className="font-display text-2xl font-medium text-navy sm:text-3xl">
            {dictionary.invite.heading}
          </h1>
        </div>
        <div className="mx-auto max-w-3xl">
          <WriteThoughtForm invitationToken={token} sessionUser={sessionUser} />
        </div>
      </PageContainer>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center py-16">
      <PageContainer className="mx-auto flex max-w-md flex-col items-center gap-6 text-center">
        <MindotLogo layout="symbol" className="h-12 w-12" />
        <span className="text-xs font-medium uppercase tracking-wide text-orange-ink">
          {dictionary.invite.eyebrow}
        </span>
        <h1 className="font-display text-3xl font-medium text-navy sm:text-4xl">{dictionary.invite.heading}</h1>
        <p className="text-ink-soft">{dictionary.invite.body}</p>
        <GoogleSignInButton redirectTo={`/invite/${token}`} />
        <p className="max-w-sm text-xs text-ink-soft">{dictionary.invite.disclaimer}</p>
      </PageContainer>
    </div>
  );
}

function inactiveStateCopy(
  dictionary: Dictionary
): Record<Exclude<InvitationStatus, "active">, { title: string; body: string }> {
  return {
    expired: { title: dictionary.invite.expiredTitle, body: dictionary.invite.expiredBody },
    used: { title: dictionary.invite.usedTitle, body: dictionary.invite.usedBody },
    revoked: { title: dictionary.invite.revokedTitle, body: dictionary.invite.revokedBody },
  };
}

function StateScreen({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center py-16">
      <PageContainer className="mx-auto flex max-w-md flex-col items-center gap-3 text-center">
        <h1 className="font-display text-2xl font-medium text-navy">{title}</h1>
        <p className="text-ink-soft">{body}</p>
      </PageContainer>
    </div>
  );
}
