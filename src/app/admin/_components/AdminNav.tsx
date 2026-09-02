"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PageContainer } from "@/components/layout/PageContainer";
import { useLocale } from "@/i18n/LocaleProvider";
import { cn } from "@/lib/cn";

/**
 * The one cross-navigation surface between the four independent admin
 * sections — without it, an admin working in e.g. moderation has no way to
 * reach invitations/access-codes/orders short of editing the URL by hand.
 * Rendered once in admin/layout.tsx (only when the session is already
 * known-admin there — a presentational nicety, not the security boundary;
 * every admin page/action still independently re-verifies role itself).
 */
export function AdminNav() {
  const { dictionary } = useLocale();
  const pathname = usePathname();

  const items = [
    { label: dictionary.moderation.title, href: "/admin/moderation" },
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
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange",
                  active ? "text-navy" : "text-ink-soft hover:text-navy"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </PageContainer>
    </div>
  );
}
