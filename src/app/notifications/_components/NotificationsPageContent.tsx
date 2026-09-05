"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { PageContainer } from "@/components/layout/PageContainer";
import { markAllNotificationsAsRead, markNotificationAsRead } from "@/features/notifications/actions";
import { NotificationRow } from "@/features/notifications/components/NotificationRow";
import type { Notification } from "@/features/notifications/types";
import { useLocale } from "@/i18n/LocaleProvider";

interface NotificationsPageContentProps {
  isSignedIn: boolean;
  items: Notification[];
  page: number;
  totalPages: number;
  unreadCount: number;
}

export function NotificationsPageContent({
  isSignedIn,
  items: initialItems,
  page,
  totalPages,
  unreadCount: initialUnreadCount,
}: NotificationsPageContentProps) {
  const { dictionary, locale } = useLocale();
  const [items, setItems] = useState(initialItems);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [isPending, startTransition] = useTransition();

  if (!isSignedIn) {
    return (
      <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center py-16">
        <PageContainer className="mx-auto flex max-w-md flex-col items-center gap-6 text-center">
          <h1 className="font-display text-2xl font-medium text-navy">{dictionary.notifications.pageTitle}</h1>
          <p className="text-sm text-ink-soft">{dictionary.notifications.signInRequiredBody}</p>
          <GoogleSignInButton redirectTo="/notifications" />
        </PageContainer>
      </div>
    );
  }

  function handleMarkRead(id: string) {
    setItems((current) => current.map((n) => (n.id === id && !n.readAt ? { ...n, readAt: new Date().toISOString() } : n)));
    setUnreadCount((current) => Math.max(0, current - 1));
    startTransition(async () => {
      await markNotificationAsRead(id);
    });
  }

  function handleMarkAllAsRead() {
    const now = new Date().toISOString();
    setItems((current) => current.map((n) => ({ ...n, readAt: n.readAt ?? now })));
    setUnreadCount(0);
    startTransition(async () => {
      await markAllNotificationsAsRead();
    });
  }

  return (
    <PageContainer className="mx-auto flex w-full max-w-2xl flex-col gap-6 py-16">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="font-display text-2xl font-medium text-navy">{dictionary.notifications.pageTitle}</h1>
        <p className="text-sm text-ink-soft">{dictionary.notifications.pageSubtitle}</p>
      </div>

      {unreadCount > 0 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleMarkAllAsRead}
            disabled={isPending}
            className="text-sm font-medium text-ink-soft hover:text-navy disabled:opacity-50"
          >
            {isPending ? dictionary.notifications.markingAllAsRead : dictionary.notifications.markAllAsRead}
          </button>
        </div>
      )}

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-1 py-16 text-center">
          <p className="text-sm font-medium text-navy">{dictionary.notifications.emptyTitle}</p>
          <p className="text-sm text-ink-soft">{dictionary.notifications.emptyBody}</p>
        </div>
      ) : (
        <ul className="flex w-full flex-col overflow-hidden rounded-lg border border-border bg-surface">
          {items.map((notification) => (
            <NotificationRow
              key={notification.id}
              notification={notification}
              dictionary={dictionary}
              locale={locale}
              onMarkRead={handleMarkRead}
            />
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <nav aria-label={dictionary.notifications.pageTitle} className="flex items-center justify-between gap-4 pt-2 text-sm">
          {page > 1 ? (
            <Link href={`/notifications?page=${page - 1}`} className="font-medium text-navy hover:text-orange">
              {dictionary.notifications.paginationPrev}
            </Link>
          ) : (
            <span aria-hidden="true" />
          )}
          <span className="text-ink-soft">
            {dictionary.notifications.paginationLabel.replace("{page}", String(page)).replace("{total}", String(totalPages))}
          </span>
          {page < totalPages ? (
            <Link href={`/notifications?page=${page + 1}`} className="font-medium text-navy hover:text-orange">
              {dictionary.notifications.paginationNext}
            </Link>
          ) : (
            <span aria-hidden="true" />
          )}
        </nav>
      )}
    </PageContainer>
  );
}
