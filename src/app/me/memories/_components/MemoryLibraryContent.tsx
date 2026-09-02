"use client";

import Link from "next/link";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { PageContainer } from "@/components/layout/PageContainer";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Note } from "@/features/notes/components/Note";
import type { MemoryLibraryItem } from "@/features/profile/types";
import { useLocale } from "@/i18n/LocaleProvider";
import type { Dictionary } from "@/i18n/translations";

interface MemoryLibraryContentProps {
  isSignedIn: boolean;
  items: MemoryLibraryItem[];
}

function outputLabel(dictionary: Dictionary, type: MemoryLibraryItem["outputType"]): string {
  return {
    personal_pdf: dictionary.memory.outputPersonalPdf,
    digital_frame: dictionary.memory.outputDigitalFrame,
    physical_gift: dictionary.memory.outputPhysicalGift,
  }[type];
}

function digitalStatusLabel(dictionary: Dictionary, status: MemoryLibraryItem["digitalStatus"]): string {
  return {
    not_applicable: dictionary.memoryLibrary.digitalNoProduct,
    waiting: dictionary.memoryLibrary.digitalWaiting,
    granted: dictionary.memoryLibrary.digitalGranted,
  }[status];
}

/** Same 8-state enum as the admin orders dashboard — reused as plain text labels here rather than importing an admin-directory component into a user-facing page. */
function physicalStatusLabel(dictionary: Dictionary, status: string): string {
  const labels: Record<string, string> = {
    pending: dictionary.adminOrders.statusPending,
    awaiting_dilekkutum_order: dictionary.adminOrders.statusAwaitingDilekkutum,
    matched: dictionary.adminOrders.statusMatched,
    in_production: dictionary.adminOrders.statusInProduction,
    packaged: dictionary.adminOrders.statusPackaged,
    shipped: dictionary.adminOrders.statusShipped,
    completed: dictionary.adminOrders.statusCompleted,
    cancelled: dictionary.adminOrders.statusCancelled,
  };
  return labels[status] ?? status;
}

export function MemoryLibraryContent({ isSignedIn, items }: MemoryLibraryContentProps) {
  const { dictionary } = useLocale();

  if (!isSignedIn) {
    return (
      <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center py-16">
        <PageContainer className="mx-auto flex max-w-md flex-col items-center gap-6 text-center">
          <h1 className="font-display text-2xl font-medium text-navy">{dictionary.memoryLibrary.pageTitle}</h1>
          <GoogleSignInButton redirectTo="/me/memories" />
        </PageContainer>
      </div>
    );
  }

  return (
    <PageContainer className="mx-auto flex max-w-2xl flex-col gap-8 py-16">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="font-display text-2xl font-medium text-navy">{dictionary.memoryLibrary.pageTitle}</h1>
        <p className="text-sm text-ink-soft">{dictionary.memoryLibrary.subtitle}</p>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-sm text-ink-soft">{dictionary.memoryLibrary.emptyMessage}</p>
          <Link href="/me/archive" className="text-sm font-medium text-ink-soft hover:text-navy">
            {dictionary.profile.archiveLinkLabel}
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {items.map((item) => (
            <li key={item.projectId} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 sm:flex-row sm:items-center">
              <div className="flex justify-center sm:shrink-0">
                {item.noteContent && item.noteTemplateId ? (
                  <Note
                    variant="static"
                    note={{
                      id: item.projectId,
                      content: item.noteContent,
                      authorName: "",
                      authorImage: null,
                      templateId: item.noteTemplateId,
                      size: "sm",
                      rotation: 0,
                      position: { top: "0%", left: "0%" },
                      language: item.noteLanguage ?? "en",
                    }}
                  />
                ) : (
                  <p className="text-xs text-ink-soft">{dictionary.memory.notEligibleBody}</p>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="border-border bg-canvas normal-case text-ink-soft">
                    {outputLabel(dictionary, item.outputType)}
                  </Badge>
                  {item.frameName && (
                    <span className="text-xs text-ink-soft">
                      {dictionary.memory.frameLabel}: {item.frameName}
                    </span>
                  )}
                  {item.outputType === "digital_frame" && (
                    <Badge
                      className={
                        item.digitalStatus === "granted"
                          ? "border-navy/20 bg-navy/5 normal-case text-navy"
                          : "border-orange/30 bg-orange-tint/60 normal-case text-orange-ink"
                      }
                    >
                      {digitalStatusLabel(dictionary, item.digitalStatus)}
                    </Badge>
                  )}
                  {item.physicalOrder && (
                    <Badge className="border-border bg-canvas normal-case text-ink-soft">
                      {physicalStatusLabel(dictionary, item.physicalOrder.status)}
                    </Badge>
                  )}
                </div>
                <span className="text-xs text-ink-soft">{new Date(item.createdAt).toLocaleDateString()}</span>
                {item.physicalOrder && (
                  <span className="font-mono text-xs text-ink-soft">{item.physicalOrder.orderNumber}</span>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  <Link href={`/memory/${item.messageId}`} className="text-xs font-medium text-ink-soft hover:text-navy">
                    {dictionary.memoryLibrary.viewProjectAction}
                  </Link>
                  {(item.outputType === "personal_pdf" || item.digitalStatus === "granted") && (
                    <>
                      <Button href={`/api/memories/${item.projectId}/download?disposition=inline`} target="_blank" rel="noopener noreferrer" variant="ghost" size="sm">
                        {dictionary.adminOrders.viewPdfButton}
                      </Button>
                      <Button href={`/api/memories/${item.projectId}/download`} size="sm">
                        {dictionary.adminOrders.downloadPdfButton}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
  );
}
