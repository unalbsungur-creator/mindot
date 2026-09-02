"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PageContainer } from "@/components/layout/PageContainer";
import { updatePhysicalOrderStatus } from "@/features/memories/actions";
import {
  PHYSICAL_ORDER_STATUSES,
  type MemoryCaptureMode,
  type MemoryOutputType,
  type PhysicalOrder,
  type PhysicalOrderStatus,
} from "@/features/memories/types";
import { cn } from "@/lib/cn";
import { useLocale } from "@/i18n/LocaleProvider";
import type { Dictionary } from "@/i18n/translations";

export interface OrderListItem {
  order: PhysicalOrder;
  outputType: MemoryOutputType | null;
  captureMode: MemoryCaptureMode | null;
  frameTemplateId: string | null;
  memoryProjectId: string | null;
  customerName: string | null;
  customerEmail: string | null;
}

interface OrdersPageContentProps {
  authorized: boolean;
  items: OrderListItem[];
}

export function OrdersPageContent({ authorized, items: initial }: OrdersPageContentProps) {
  const { dictionary } = useLocale();
  const [items, setItems] = useState(initial);

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
    <PageContainer className="flex flex-col gap-8 py-16">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-medium text-navy sm:text-4xl">{dictionary.adminOrders.title}</h1>
        <p className="text-ink-soft">{dictionary.adminOrders.subtitle}</p>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-ink-soft">{dictionary.adminOrders.noOrdersYet}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <OrderRow
              key={item.order.id}
              item={item}
              onUpdated={(updated) =>
                setItems((current) =>
                  current.map((entry) => (entry.order.id === updated.id ? { ...entry, order: updated } : entry))
                )
              }
            />
          ))}
        </div>
      )}
    </PageContainer>
  );
}

export function statusLabel(dictionary: Dictionary, status: PhysicalOrderStatus): string {
  return {
    pending: dictionary.adminOrders.statusPending,
    awaiting_dilekkutum_order: dictionary.adminOrders.statusAwaitingDilekkutum,
    matched: dictionary.adminOrders.statusMatched,
    in_production: dictionary.adminOrders.statusInProduction,
    packaged: dictionary.adminOrders.statusPackaged,
    shipped: dictionary.adminOrders.statusShipped,
    completed: dictionary.adminOrders.statusCompleted,
    cancelled: dictionary.adminOrders.statusCancelled,
  }[status];
}

function outputTypeLabel(dictionary: Dictionary, type: MemoryOutputType | null): string {
  if (!type) return "—";
  return {
    personal_pdf: dictionary.memory.outputPersonalPdf,
    digital_frame: dictionary.memory.outputDigitalFrame,
    physical_gift: dictionary.memory.outputPhysicalGift,
  }[type];
}

function OrderRow({ item, onUpdated }: { item: OrderListItem; onUpdated: (order: PhysicalOrder) => void }) {
  const { dictionary } = useLocale();
  const [isPending, startTransition] = useTransition();
  const { order } = item;

  function handleStatusChange(status: PhysicalOrderStatus) {
    startTransition(async () => {
      const result = await updatePhysicalOrderStatus(order.id, status);
      if (result.ok && result.data) onUpdated(result.data);
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-1">
        <Link href={`/admin/orders/${order.orderNumber}`} className="font-mono text-sm font-semibold text-navy hover:underline">
          {order.orderNumber}
        </Link>
        <span className="text-xs text-ink-soft">
          {dictionary.adminOrders.createdLabel}: {new Date(order.createdAt).toLocaleString()}
        </span>
        <span className="text-xs text-ink-soft">
          {dictionary.adminOrders.outputTypeLabel}: {outputTypeLabel(dictionary, item.outputType)}
        </span>
        {(item.customerName || item.customerEmail) && (
          <span className="text-xs text-ink-soft">{item.customerName ?? item.customerEmail}</span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge className={cn("normal-case border-border bg-canvas text-ink-soft")}>
          {statusLabel(dictionary, order.status)}
        </Badge>
        <label htmlFor={`status-${order.id}`} className="sr-only">
          {dictionary.adminOrders.updateStatusLabel}
        </label>
        <select
          id={`status-${order.id}`}
          value={order.status}
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
        <Button href={`/admin/orders/${order.orderNumber}`} size="sm" variant="ghost">
          {dictionary.adminOrders.viewDetailButton}
        </Button>
      </div>
    </div>
  );
}
