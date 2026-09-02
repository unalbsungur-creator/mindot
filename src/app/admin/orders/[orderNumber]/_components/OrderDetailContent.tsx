"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PageContainer } from "@/components/layout/PageContainer";
import { StatePanel } from "@/components/ui/StatePanel";
import { updatePhysicalOrderStatus } from "@/features/memories/actions";
import { getFrameTemplate } from "@/features/memories/config/frameTemplates";
import type { MemoryProject, PhysicalOrder } from "@/features/memories/types";
import { PHYSICAL_ORDER_STATUSES, type PhysicalOrderStatus } from "@/features/memories/types";
import { Note } from "@/features/notes/components/Note";
import type { NoteData } from "@/features/notes/types";
import type { PublicMessageDetail } from "@/features/board/types";
import { cn } from "@/lib/cn";
import { useLocale } from "@/i18n/LocaleProvider";
import type { Dictionary } from "@/i18n/translations";
import { statusLabel } from "../../_components/OrdersPageContent";

interface OrderDetailContentProps {
  authorized: boolean;
  order: PhysicalOrder | null;
  project: MemoryProject | null;
  message: PublicMessageDetail | null;
  customer: { name: string | null; email: string | null } | null;
}

function outputTypeLabel(dictionary: Dictionary, type: MemoryProject["outputType"]): string {
  return {
    personal_pdf: dictionary.memory.outputPersonalPdf,
    digital_frame: dictionary.memory.outputDigitalFrame,
    physical_gift: dictionary.memory.outputPhysicalGift,
  }[type];
}

function captureModeLabel(dictionary: Dictionary, mode: MemoryProject["captureMode"]): string {
  return mode === "note_only" ? dictionary.memory.captureNoteOnly : dictionary.memory.captureSurrounding;
}

export function OrderDetailContent({ authorized, order, project, message, customer }: OrderDetailContentProps) {
  const { dictionary } = useLocale();
  const [currentOrder, setCurrentOrder] = useState(order);
  const [isPending, startTransition] = useTransition();

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

  if (!currentOrder || !project) {
    return (
      <StatePanel
        title={dictionary.states.notFoundTitle}
        body={dictionary.states.notFoundBody}
        action={{ label: dictionary.adminOrders.backToList, href: "/admin/orders" }}
      />
    );
  }

  function handleStatusChange(status: PhysicalOrderStatus) {
    if (!currentOrder) return;
    startTransition(async () => {
      const result = await updatePhysicalOrderStatus(currentOrder.id, status);
      if (result.ok && result.data) setCurrentOrder(result.data);
    });
  }

  const previewNote: NoteData | null = message
    ? {
        id: message.id,
        content: message.content,
        authorName: message.author?.displayName ?? "",
        authorImage: message.author?.image ?? null,
        templateId: message.templateId,
        size: "md",
        rotation: 0,
        position: { top: "0%", left: "0%" },
        language: message.language,
      }
    : null;

  const frame = project.frameTemplateId ? getFrameTemplate(project.frameTemplateId) : null;

  return (
    <PageContainer className="flex flex-col gap-8 py-16">
      <div className="flex flex-col gap-2">
        <Link href="/admin/orders" className="text-sm text-ink-soft hover:text-navy">
          ← {dictionary.adminOrders.backToList}
        </Link>
        <h1 className="font-mono text-2xl font-semibold text-navy">{currentOrder.orderNumber}</h1>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5">
          <h2 className="font-display text-lg font-medium text-navy">{dictionary.adminOrders.memoryHeading}</h2>
          {previewNote ? (
            <div className="flex justify-center py-2">
              <Note note={previewNote} variant="static" />
            </div>
          ) : (
            <p className="text-sm text-ink-soft">{dictionary.memory.notEligibleBody}</p>
          )}
          <dl className="flex flex-col gap-1 text-sm text-ink-soft">
            <div>
              {dictionary.adminOrders.outputTypeLabel}: {outputTypeLabel(dictionary, project.outputType)}
            </div>
            <div>
              {dictionary.adminOrders.captureModeLabel}: {captureModeLabel(dictionary, project.captureMode)}
            </div>
            {frame && (
              <div>
                {dictionary.memory.frameLabel}: {frame.name}
              </div>
            )}
          </dl>
        </section>

        <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5">
          <h2 className="font-display text-lg font-medium text-navy">{dictionary.adminOrders.customerHeading}</h2>
          <dl className="flex flex-col gap-1 text-sm text-ink-soft">
            <div>
              {dictionary.adminOrders.customerNameLabel}: {customer?.name ?? "—"}
            </div>
            <div>
              {dictionary.adminOrders.customerEmailLabel}: {customer?.email ?? "—"}
            </div>
          </dl>
        </section>

        <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5">
          <h2 className="font-display text-lg font-medium text-navy">{dictionary.adminOrders.productionHeading}</h2>
          <dl className="flex flex-col gap-1 text-sm text-ink-soft">
            <div>
              {dictionary.adminOrders.createdLabel}: {new Date(currentOrder.createdAt).toLocaleString()}
            </div>
            <div className="flex items-center gap-2">
              <Badge className={cn("normal-case border-border bg-canvas text-ink-soft")}>
                {statusLabel(dictionary, currentOrder.status)}
              </Badge>
            </div>
          </dl>
          <div className="flex items-center gap-2 pt-1">
            <label htmlFor="detail-status" className="text-sm font-medium text-navy">
              {dictionary.adminOrders.updateStatusLabel}
            </label>
            <select
              id="detail-status"
              value={currentOrder.status}
              disabled={isPending}
              onChange={(event) => handleStatusChange(event.target.value as PhysicalOrderStatus)}
              className="rounded-md border border-border bg-surface p-1.5 text-xs text-ink shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
            >
              {PHYSICAL_ORDER_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {statusLabel(dictionary, status)}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5">
          <h2 className="font-display text-lg font-medium text-navy">{dictionary.adminOrders.viewPdfButton}</h2>
          <div className="flex flex-wrap gap-2">
            <Button href={`/api/memories/${project.id}/download?disposition=inline`} target="_blank" rel="noopener noreferrer" variant="ghost">
              {dictionary.adminOrders.viewPdfButton}
            </Button>
            <Button href={`/api/memories/${project.id}/download`}>{dictionary.adminOrders.downloadPdfButton}</Button>
          </div>
        </section>
      </div>
    </PageContainer>
  );
}
