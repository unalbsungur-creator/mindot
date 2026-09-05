"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { markAllNotificationsAsRead, markNotificationAsRead } from "@/features/notifications/actions";
import { NotificationRow } from "@/features/notifications/components/NotificationRow";
import type { Notification } from "@/features/notifications/types";
import { useLocale } from "@/i18n/LocaleProvider";

interface SummaryResponse {
  unreadCount: number;
  items: Notification[];
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className={className}>
      <path
        d="M10 2.5c-2.2 0-4 1.8-4 4v2.1c0 .5-.15 1-.44 1.42L4.3 12.1c-.5.72 0 1.7.87 1.7h9.66c.87 0 1.37-.98.87-1.7l-1.26-2.08a2.5 2.5 0 0 1-.44-1.42V6.5c0-2.2-1.8-4-4-4Z"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M8.2 15.8a1.9 1.9 0 0 0 3.6 0" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  );
}

/**
 * The one header entry point into the notification system — rendered by
 * SiteHeader only when a signed-in session is already known (see its own
 * `/api/session/summary` fetch). Fetches its own small "recent + unread
 * count" summary once on mount (`/api/notifications/summary`) — no
 * polling/interval and no WebSocket, per EPIC 023's explicit "in-app only,
 * no realtime/polling infrastructure" scope. The popover reuses that same
 * fetched list rather than issuing a second request when opened.
 */
export function NotificationBell() {
  const { dictionary, locale } = useLocale();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState<Notification[]>([]);
  const [, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  function fetchSummary() {
    return fetch("/api/notifications/summary")
      .then((response) => (response.ok ? (response.json() as Promise<SummaryResponse>) : Promise.reject(new Error("request failed"))))
      .then((data) => {
        setUnreadCount(data.unreadCount);
        setItems(data.items);
        setState("ready");
      })
      .catch(() => setState("error"));
  }

  // Initial state is already "loading" (see useState above), so the mount
  // effect only needs to kick off the fetch itself — no synchronous
  // setState call in the effect body. `retry()` below is a plain event
  // handler (not an effect), so it's free to set "loading" directly before
  // re-fetching.
  useEffect(() => {
    fetchSummary();
  }, []);

  function retry() {
    setState("loading");
    fetchSummary();
  }

  useEffect(() => {
    if (!open) return;
    headingRef.current?.focus();

    function handlePointerDown(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

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

  const badgeText = unreadCount > 99 ? "99+" : String(unreadCount);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={dictionary.notifications.bellLabel}
        onClick={() => setOpen((current) => !current)}
        className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/80 transition-colors hover:text-orange focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
      >
        <BellIcon className="h-5 w-5" />
        {unreadCount > 0 && (
          <>
            <span
              aria-hidden="true"
              className="absolute right-0 top-0 inline-flex h-4 min-w-[1rem] shrink-0 items-center justify-center rounded-full bg-orange px-1 text-[10px] font-semibold leading-none text-navy tabular-nums"
            >
              {badgeText}
            </span>
            <span className="sr-only">{`${unreadCount} ${dictionary.notifications.unreadCountLabel}`}</span>
          </>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={dictionary.notifications.panelTitle}
          className="absolute right-0 top-full z-[var(--z-header)] mt-2 w-[min(340px,calc(100vw-2rem))] overflow-hidden rounded-lg border border-border bg-surface text-ink shadow-card"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <h2 ref={headingRef} tabIndex={-1} className="font-display text-sm font-medium text-navy focus:outline-none">
              {dictionary.notifications.panelTitle}
            </h2>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllAsRead}
                className="text-xs font-medium text-ink-soft hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
              >
                {dictionary.notifications.markAllAsRead}
              </button>
            )}
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {state === "loading" && <p className="px-4 py-6 text-center text-sm text-ink-soft">{dictionary.notifications.loading}</p>}
            {state === "error" && (
              <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
                <p className="text-sm text-ink-soft">{dictionary.notifications.error}</p>
                <button type="button" onClick={retry} className="text-xs font-medium text-navy underline underline-offset-2">
                  {dictionary.notifications.retry}
                </button>
              </div>
            )}
            {state === "ready" && items.length === 0 && (
              <div className="flex flex-col items-center gap-1 px-4 py-8 text-center">
                <p className="text-sm font-medium text-navy">{dictionary.notifications.emptyTitle}</p>
                <p className="text-xs text-ink-soft">{dictionary.notifications.emptyBody}</p>
              </div>
            )}
            {state === "ready" && items.length > 0 && (
              <ul className="flex flex-col">
                {items.map((notification) => (
                  <NotificationRow
                    key={notification.id}
                    notification={notification}
                    dictionary={dictionary}
                    locale={locale}
                    onMarkRead={handleMarkRead}
                    onNavigate={() => setOpen(false)}
                  />
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-border px-4 py-2.5 text-center">
            <Link href="/notifications" onClick={() => setOpen(false)} className="text-xs font-medium text-navy hover:text-orange">
              {dictionary.notifications.viewAllLink}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
