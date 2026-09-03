"use client";

import { useState, useTransition } from "react";
import { PageContainer } from "@/components/layout/PageContainer";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Note } from "@/features/notes/components/Note";
import { getNoteTemplate } from "@/features/notes/config/templates";
import type { NoteData } from "@/features/notes/types";
import { archiveMessage } from "@/features/messages/moderation-actions";
import type { MessageStatus } from "@/features/messages/types";
import { dismissReport, resolveReport } from "@/features/reports/actions";
import type { ReportQueueItem, ReportReason } from "@/features/reports/types";
import { useLocale } from "@/i18n/LocaleProvider";
import type { Dictionary } from "@/i18n/translations";
import { cn } from "@/lib/cn";

interface ReportsPageContentProps {
  authorized: boolean;
  items: ReportQueueItem[];
}

function reasonLabel(dictionary: Dictionary, reason: ReportReason): string {
  return {
    spam: dictionary.report.reasonSpam,
    harassment: dictionary.report.reasonHarassment,
    hate: dictionary.report.reasonHate,
    sexual_content: dictionary.report.reasonSexualContent,
    violence: dictionary.report.reasonViolence,
    illegal: dictionary.report.reasonIllegal,
    copyright: dictionary.report.reasonCopyright,
    other: dictionary.report.reasonOther,
  }[reason];
}

// Reuses the moderation dictionary's own status labels rather than
// translating the same four words a third time — messages.status is the
// same enum in both places.
function messageStatusLabel(dictionary: Dictionary, status: MessageStatus): string {
  return {
    pending: dictionary.moderation.statusPending,
    approved: dictionary.moderation.statusApproved,
    rejected: dictionary.moderation.statusRejected,
    archived: dictionary.moderation.statusArchived,
  }[status];
}

export function ReportsPageContent({ authorized, items: initialItems }: ReportsPageContentProps) {
  const { dictionary } = useLocale();
  const [items, setItems] = useState(initialItems);

  if (!authorized) {
    return (
      <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center py-16">
        <PageContainer className="mx-auto flex max-w-md flex-col items-center gap-3 text-center">
          <h1 className="font-display text-2xl font-medium text-navy">{dictionary.reportsAdmin.unauthorizedTitle}</h1>
          <p className="text-ink-soft">{dictionary.reportsAdmin.unauthorizedBody}</p>
        </PageContainer>
      </div>
    );
  }

  function removeItem(reportId: string) {
    setItems((current) => current.filter((item) => item.report.id !== reportId));
  }

  function updateMessageStatus(reportId: string, status: MessageStatus) {
    setItems((current) =>
      current.map((item) =>
        item.report.id === reportId && item.message ? { ...item, message: { ...item.message, status } } : item
      )
    );
  }

  return (
    <PageContainer className="py-16">
      <div className="mx-auto flex max-w-3xl flex-col gap-2 pb-8">
        <h1 className="font-display text-3xl font-medium text-navy sm:text-4xl">{dictionary.reportsAdmin.title}</h1>
        <p className="text-ink-soft">{dictionary.reportsAdmin.subtitle}</p>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-ink-soft">{dictionary.reportsAdmin.emptyQueue}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {items.map((item) => (
            <ReportCard
              key={item.report.id}
              item={item}
              onResolved={() => removeItem(item.report.id)}
              onDismissed={() => removeItem(item.report.id)}
              onMessageArchived={() => updateMessageStatus(item.report.id, "archived")}
            />
          ))}
        </div>
      )}
    </PageContainer>
  );
}

function ReportCard({
  item,
  onResolved,
  onDismissed,
  onMessageArchived,
}: {
  item: ReportQueueItem;
  onResolved: () => void;
  onDismissed: () => void;
  onMessageArchived: () => void;
}) {
  const { dictionary } = useLocale();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(false);

  const previewNote: NoteData | null = item.message
    ? {
        id: item.message.id,
        content: item.message.content,
        authorName: item.message.authorName,
        templateId: item.message.templateId,
        size: "sm",
        rotation: 0,
        position: { top: "0%", left: "0%" },
        language: item.message.language,
      }
    : null;
  const template = item.message ? getNoteTemplate(item.message.templateId) : null;

  function handleResolve() {
    setError(false);
    startTransition(async () => {
      const result = await resolveReport(item.report.id);
      if (!result.ok) {
        setError(true);
        return;
      }
      onResolved();
    });
  }

  function handleDismiss() {
    setError(false);
    startTransition(async () => {
      const result = await dismissReport(item.report.id);
      if (!result.ok) {
        setError(true);
        return;
      }
      onDismissed();
    });
  }

  function handleArchiveMessage() {
    setError(false);
    startTransition(async () => {
      const result = await archiveMessage(item.report.messageId);
      if (!result.ok) {
        setError(true);
        return;
      }
      onMessageArchived();
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 sm:flex-row sm:items-start">
      <div className="flex justify-center sm:shrink-0">
        {previewNote ? (
          <Note variant="static" note={previewNote} />
        ) : (
          <p className="w-44 text-center text-xs text-ink-soft">{dictionary.reportsAdmin.messageMissing}</p>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge className="normal-case border-orange/30 bg-orange-tint/60 text-orange-ink">
            {reasonLabel(dictionary, item.report.reason)}
          </Badge>
          {item.message && template && (
            <Badge className="normal-case border-border bg-canvas text-ink-soft">
              {messageStatusLabel(dictionary, item.message.status as MessageStatus)}
            </Badge>
          )}
        </div>

        {item.report.details && (
          <p className="text-sm text-ink">
            <span className="font-medium text-navy">{dictionary.reportsAdmin.detailsLabel}: </span>
            {item.report.details}
          </p>
        )}

        <p className="text-xs text-ink-soft">
          {dictionary.reportsAdmin.reporterLabel}:{" "}
          {item.reporterKind === "anonymous" ? dictionary.reportsAdmin.reporterAnonymous : item.reporterName}
        </p>
        <p className="text-xs text-ink-soft">
          {dictionary.reportsAdmin.reportedAtLabel} {new Date(item.report.createdAt).toLocaleString()}
        </p>

        <div className="mt-auto flex flex-wrap items-center gap-3 pt-1">
          <Button size="sm" onClick={handleResolve} disabled={isPending}>
            {isPending ? dictionary.reportsAdmin.resolving : dictionary.reportsAdmin.resolveAction}
          </Button>
          <Button size="sm" variant="ghost" onClick={handleDismiss} disabled={isPending}>
            {isPending ? dictionary.reportsAdmin.dismissing : dictionary.reportsAdmin.dismissAction}
          </Button>
          {item.message?.status === "approved" && (
            <button
              type="button"
              onClick={handleArchiveMessage}
              disabled={isPending}
              className={cn("text-xs font-medium text-ink-soft hover:text-navy disabled:opacity-50")}
            >
              {isPending ? dictionary.reportsAdmin.archiving : dictionary.reportsAdmin.archiveMessageAction}
            </button>
          )}
          {error && <span className="text-xs text-red-600">{dictionary.reportsAdmin.errorGeneric}</span>}
        </div>
      </div>
    </div>
  );
}
