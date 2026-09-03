"use client";

import { useEffect, useId, useRef, useState, useTransition, type MouseEvent } from "react";
import { PageContainer } from "@/components/layout/PageContainer";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { suspendUser, unsuspendUser } from "@/features/users/moderation-actions";
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
  onSuspended,
  onUnsuspended,
}: {
  row: UserRow;
  isSelf: boolean;
  onSuspended: (reason: string | null) => void;
  onUnsuspended: () => void;
}) {
  const { dictionary } = useLocale();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

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
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
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

function SuspendDialog({
  open,
  userId,
  onClose,
  onSuspended,
}: {
  open: boolean;
  userId: string;
  onClose: () => void;
  onSuspended: (reason: string | null) => void;
}) {
  const { dictionary } = useLocale();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const reasonId = useId();
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setReason("");
      setError(false);
    }
  }, [open]);

  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === dialogRef.current && !isPending) onClose();
  }

  function handleConfirm() {
    setError(false);
    startTransition(async () => {
      const result = await suspendUser(userId, reason);
      if (!result.ok) {
        setError(true);
        return;
      }
      onSuspended(reason.trim() || null);
    });
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={headingId}
      onCancel={(event) => {
        event.preventDefault();
        if (!isPending) onClose();
      }}
      onClick={handleBackdropClick}
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-lg border border-border bg-surface p-0 shadow-card backdrop:bg-navy/50 backdrop:backdrop-blur-sm"
    >
      <div className="flex flex-col gap-4 p-5 sm:p-6">
        <h2 id={headingId} className="font-display text-lg font-medium text-navy">
          {dictionary.usersAdmin.suspendDialogTitle}
        </h2>
        <p className="text-sm leading-relaxed text-ink-soft">{dictionary.usersAdmin.suspendDialogBody}</p>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={reasonId} className="text-sm font-medium text-navy">
            {dictionary.usersAdmin.suspendReasonLabel}
          </label>
          <textarea
            id={reasonId}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={dictionary.usersAdmin.suspendReasonPlaceholder}
            rows={3}
            maxLength={500}
            className="w-full rounded-md border border-border bg-canvas p-2.5 text-sm text-ink shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {dictionary.usersAdmin.errorGeneric}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={isPending}>
            {dictionary.usersAdmin.suspendCancel}
          </Button>
          <Button type="button" size="sm" onClick={handleConfirm} disabled={isPending}>
            {isPending ? dictionary.usersAdmin.suspending : dictionary.usersAdmin.suspendConfirm}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
