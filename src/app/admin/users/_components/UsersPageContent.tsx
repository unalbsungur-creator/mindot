"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { PageContainer } from "@/components/layout/PageContainer";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SuspendDialog } from "@/features/users/components/SuspendDialog";
import { unsuspendUser } from "@/features/users/moderation-actions";
import type { User } from "@/features/users/types";
import { useLocale } from "@/i18n/LocaleProvider";
import { cn } from "@/lib/cn";

interface MessageCounts {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  archived: number;
}

interface UserRow {
  user: User;
  messageCounts: MessageCounts;
}

interface UsersPageContentProps {
  authorized: boolean;
  items: UserRow[];
  currentUserId: string | null;
}

export function UsersPageContent({ authorized, items: initialItems, currentUserId }: UsersPageContentProps) {
  const { dictionary } = useLocale();
  const [items, setItems] = useState(initialItems);
  // EPIC 019: the report → suspend bridge's "View user" link lands here
  // with `?highlight=<userId>` so the admin doesn't have to search the
  // list by name/email — same `useSearchParams()` pattern already used by
  // TimeRangeFilter, purely a client-side scroll/highlight cue over data
  // this page already fetched under its own `authorized` check; it grants
  // nothing and mutates nothing on its own.
  const highlightId = useSearchParams().get("highlight");

  if (!authorized) {
    return (
      <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center py-16">
        <PageContainer className="mx-auto flex max-w-md flex-col items-center gap-3 text-center">
          <h1 className="font-display text-2xl font-medium text-navy">{dictionary.usersAdmin.unauthorizedTitle}</h1>
          <p className="text-ink-soft">{dictionary.usersAdmin.unauthorizedBody}</p>
        </PageContainer>
      </div>
    );
  }

  function updateUser(userId: string, patch: Partial<User>) {
    setItems((current) => current.map((row) => (row.user.id === userId ? { ...row, user: { ...row.user, ...patch } } : row)));
  }

  return (
    <PageContainer className="py-16">
      <div className="mx-auto flex max-w-3xl flex-col gap-2 pb-8">
        <h1 className="font-display text-3xl font-medium text-navy sm:text-4xl">{dictionary.usersAdmin.title}</h1>
        <p className="text-ink-soft">{dictionary.usersAdmin.subtitle}</p>
      </div>

      <div className="flex flex-col gap-4">
        {items.map((row) => (
          <UserRowCard
            key={row.user.id}
            row={row}
            isSelf={row.user.id === currentUserId}
            isHighlighted={row.user.id === highlightId}
            onSuspended={(reason) => updateUser(row.user.id, { status: "suspended", statusReason: reason })}
            onUnsuspended={() => updateUser(row.user.id, { status: "active", statusReason: null })}
          />
        ))}
      </div>
    </PageContainer>
  );
}

function UserRowCard({
  row,
  isSelf,
  isHighlighted,
  onSuspended,
  onUnsuspended,
}: {
  row: UserRow;
  isSelf: boolean;
  isHighlighted: boolean;
  onSuspended: (reason: string | null) => void;
  onUnsuspended: () => void;
}) {
  const { dictionary } = useLocale();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isHighlighted) cardRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [isHighlighted]);

  const { user, messageCounts } = row;
  const isSuspended = user.status === "suspended";

  function handleUnsuspend() {
    setError(false);
    startTransition(async () => {
      const result = await unsuspendUser(user.id);
      if (!result.ok) {
        setError(true);
        return;
      }
      onUnsuspended();
    });
  }

  return (
    <div
      ref={cardRef}
      className={cn(
        "flex flex-col gap-3 rounded-lg border border-border bg-surface p-4",
        isHighlighted && "ring-2 ring-orange"
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-navy">{user.name ?? user.email}</span>
        <span className="text-xs text-ink-soft">{user.email}</span>
        <Badge className="normal-case border-border bg-canvas text-ink-soft">
          {user.role === "admin" ? dictionary.usersAdmin.roleAdmin : dictionary.usersAdmin.roleUser}
        </Badge>
        <Badge
          className={cn(
            "normal-case",
            isSuspended ? "border-red-200 bg-red-50 text-red-700" : "border-navy/20 bg-navy/5 text-navy"
          )}
        >
          {isSuspended ? dictionary.usersAdmin.statusSuspended : dictionary.usersAdmin.statusActive}
        </Badge>
      </div>

      <p className="text-xs text-ink-soft">
        {dictionary.usersAdmin.contentLabel}: {messageCounts.total} ({dictionary.moderation.statusApproved.toLowerCase()}{" "}
        {messageCounts.approved}, {dictionary.moderation.statusPending.toLowerCase()} {messageCounts.pending},{" "}
        {dictionary.moderation.statusRejected.toLowerCase()} {messageCounts.rejected},{" "}
        {dictionary.moderation.statusArchived.toLowerCase()} {messageCounts.archived})
      </p>

      {isSuspended && (
        <p className="text-xs text-ink-soft">
          <span className="font-medium text-navy">{dictionary.usersAdmin.reasonLabel}: </span>
          {user.statusReason || dictionary.usersAdmin.noReason}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {isSelf ? (
          <span className="text-xs text-ink-soft">{dictionary.usersAdmin.youLabel}</span>
        ) : isSuspended ? (
          <Button size="sm" onClick={handleUnsuspend} disabled={isPending}>
            {isPending ? dictionary.usersAdmin.unsuspending : dictionary.usersAdmin.unsuspendAction}
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setDialogOpen(true)} disabled={isPending}>
            {dictionary.usersAdmin.suspendAction}
          </Button>
        )}
        {error && <span className="text-xs text-red-600">{dictionary.usersAdmin.errorGeneric}</span>}
      </div>

      <SuspendDialog
        open={dialogOpen}
        userId={user.id}
        onClose={() => setDialogOpen(false)}
        onSuspended={(reason) => {
          setDialogOpen(false);
          onSuspended(reason);
        }}
      />
    </div>
  );
}
