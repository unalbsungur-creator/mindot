"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PageContainer } from "@/components/layout/PageContainer";
import { useLocale } from "@/i18n/LocaleProvider";
import { cn } from "@/lib/cn";

interface AdminNavProps {
  /** EPIC 022: pending messages awaiting moderation — 0 renders no badge. */
  pendingModerationCount: number;
  /** EPIC 022: open (unresolved) reports — 0 renders no badge. */
  openReportCount: number;
}

/**
 * The one cross-navigation surface between the four independent admin
 * sections — without it, an admin working in e.g. moderation has no way to
 * reach invitations/access-codes/orders short of editing the URL by hand.
 * Rendered once in admin/layout.tsx (only when the session is already
 * known-admin there — a presentational nicety, not the security boundary;
 * every admin page/action still independently re-verifies role itself).
 */
export function AdminNav({ pendingModerationCount, openReportCount }: AdminNavProps) {
  const { dictionary } = useLocale();
  const pathname = usePathname();

  const items: { label: string; href: string; count?: number }[] = [
    { label: dictionary.moderation.title, href: "/admin/moderation", count: pendingModerationCount },
    { label: dictionary.reportsAdmin.title, href: "/admin/reports", count: openReportCount },
    { label: dictionary.usersAdmin.title, href: "/admin/users" },
    { label: dictionary.invitationsAdmin.title, href: "/admin/invitations" },
    { label: dictionary.adminAccessCodes.title, href: "/admin/access-codes" },
    { label: dictionary.adminOrders.title, href: "/admin/orders" },
  ];

  return (
    <div className="border-b border-border/70 bg-canvas">
      <PageContainer>
        <nav aria-label={dictionary.common.adminSectionsLabel} className="flex flex-wrap gap-x-6 gap-y-2 py-3">
          {items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const hasBadge = typeof item.count === "number" && item.count > 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange",
                  active ? "text-navy" : "text-ink-soft hover:text-navy"
                )}
              >
                {item.label}
                {hasBadge && (
                  <>
                    <span
                      aria-hidden="true"
                      className="inline-flex h-4 min-w-[1rem] shrink-0 items-center justify-center rounded-full bg-orange px-1 text-[10px] font-semibold leading-none text-white tabular-nums"
                    >
                      {item.count! > 99 ? "99+" : item.count}
                    </span>
                    <span className="sr-only">{`${item.count} ${dictionary.common.adminNavPendingCountLabel}`}</span>
                  </>
                )}
              </Link>
            );
          })}
        </nav>
      </PageContainer>
    </div>
  );
}
