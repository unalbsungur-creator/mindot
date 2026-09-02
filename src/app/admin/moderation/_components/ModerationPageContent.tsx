"use client";

import { PageContainer } from "@/components/layout/PageContainer";
import { ModerationQueue } from "@/features/messages/components/ModerationQueue";
import type { Message } from "@/features/messages/types";
import { useLocale } from "@/i18n/LocaleProvider";

interface ModerationPageContentProps {
  authorized: boolean;
  pending: Message[];
  approved: Message[];
  archived: Message[];
  rejected: Message[];
}

export function ModerationPageContent({ authorized, pending, approved, archived, rejected }: ModerationPageContentProps) {
  const { dictionary } = useLocale();

  if (!authorized) {
    return (
      <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center py-16">
        <PageContainer className="mx-auto flex max-w-md flex-col items-center gap-3 text-center">
          <h1 className="font-display text-2xl font-medium text-navy">
            {dictionary.moderation.unauthorizedTitle}
          </h1>
          <p className="text-ink-soft">{dictionary.moderation.unauthorizedBody}</p>
        </PageContainer>
      </div>
    );
  }

  return (
    <PageContainer className="py-16">
      {/* EPIC: Yönetim Panelinde Statü Grupları — no narrow max-w-3xl
          column here anymore: horizontal card rows need real desktop
          width to show more than one card per row (see ModerationQueue). */}
      <div className="mx-auto flex max-w-3xl flex-col gap-2 pb-8">
        <h1 className="font-display text-3xl font-medium text-navy sm:text-4xl">
          {dictionary.moderation.title}
        </h1>
        <p className="text-ink-soft">{dictionary.moderation.subtitle}</p>
      </div>
      <ModerationQueue pending={pending} approved={approved} archived={archived} rejected={rejected} />
    </PageContainer>
  );
}
