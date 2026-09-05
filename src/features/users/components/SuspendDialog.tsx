"use client";

import { useEffect, useId, useRef, useState, useTransition, type MouseEvent } from "react";
import { Button } from "@/components/ui/Button";
import { suspendUser } from "@/features/users/moderation-actions";
import { useLocale } from "@/i18n/LocaleProvider";

/**
 * EPIC 019: extracted out of `UsersPageContent` (which previously defined
 * this locally, unexported) so `/admin/reports`'s report → suspend bridge
 * can reuse the exact same dialog rather than a second implementation.
 * Behavior is unchanged from the original — same native `<dialog>`
 * foundation, same `suspendUser()` call, same reason textarea. `userId` is
 * always a server-resolved id the caller already has (a report's real
 * `message.authorId`, or a user row's own `id`) — this component never
 * accepts or trusts anything else as the target.
 */
export function SuspendDialog({
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
