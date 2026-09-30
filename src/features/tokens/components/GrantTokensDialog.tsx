"use client";

import { useEffect, useId, useRef, useState, useTransition, type MouseEvent } from "react";
import { Button } from "@/components/ui/Button";
import { grantTokens, type GrantTokensError } from "@/features/tokens/admin-actions";
import { MAX_ADMIN_GRANT_AMOUNT } from "@/features/tokens/types";
import { useLocale } from "@/i18n/LocaleProvider";
import { cn } from "@/lib/cn";

const QUICK_AMOUNTS = [1, 5, 10];

/**
 * Admin "Grant Tokens" step on /admin/users — same native `<dialog>`
 * foundation as `SuspendDialog`. Pressing Confirm is the confirmation. One
 * `requestId` is minted per opening and reused by every retry of that
 * opening, so a double-click or a retried request after a lost response
 * can never credit the same grant twice (the server turns it into the
 * ledger's idempotency key). `userId` is always the row's own server id.
 */
export function GrantTokensDialog({
  open,
  userId,
  userLabel,
  onClose,
  onGranted,
}: {
  open: boolean;
  userId: string;
  userLabel: string;
  onClose: () => void;
  onGranted: (balance: number) => void;
}) {
  const { dictionary } = useLocale();
  const t = dictionary.usersAdmin;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const amountId = useId();
  const noteId = useId();
  const [amount, setAmount] = useState("1");
  const [note, setNote] = useState("");
  const [requestId, setRequestId] = useState("");
  const [error, setError] = useState<GrantTokensError | "generic" | null>(null);
  const [success, setSuccess] = useState<{ message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAmount("1");
      setNote("");
      setError(null);
      setSuccess(null);
      setRequestId(crypto.randomUUID());
    }
  }, [open]);

  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === dialogRef.current && !isPending) onClose();
  }

  function handleConfirm() {
    const parsed = Number(amount);
    if (!/^\d+$/.test(amount.trim()) || parsed < 1 || parsed > MAX_ADMIN_GRANT_AMOUNT) {
      setError("invalid-amount");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await grantTokens({ userId, amount: parsed, note, requestId });
        if (!result.ok || !result.data) {
          setError(result.error ?? "generic");
          return;
        }
        const { balance, status } = result.data;
        const template = status === "granted" ? t.grantSuccess : t.grantAlreadyRecorded;
        setSuccess({ message: template.replace("{amount}", String(parsed)).replace("{balance}", String(balance)) });
        onGranted(balance);
      } catch {
        // Network/server failure: the same requestId is kept, so pressing
        // Confirm again is a safe retry, never a second grant.
        setError("generic");
      }
    });
  }

  const errorMessage =
    error === "invalid-amount"
      ? t.grantErrorInvalidAmount.replace("{max}", String(MAX_ADMIN_GRANT_AMOUNT))
      : error === "target-user-not-found"
        ? t.grantErrorTargetNotFound
        : error === "conflict"
          ? t.grantErrorConflict
          : error === "auth-required" || error === "forbidden"
            ? t.grantErrorUnauthorized
            : error
              ? t.errorGeneric
              : null;

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
          {t.grantDialogTitle}
        </h2>
        <p className="text-sm leading-relaxed text-ink-soft">{t.grantDialogBody.replace("{name}", userLabel)}</p>

        {success ? (
          <p role="status" className="text-sm text-navy">
            {success.message}
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={amountId} className="text-sm font-medium text-navy">
                {t.grantAmountLabel}
              </label>
              <input
                id={amountId}
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_ADMIN_GRANT_AMOUNT}
                step={1}
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                disabled={isPending}
                className="w-full rounded-md border border-border bg-canvas p-2.5 text-sm text-ink shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
              />
              <div role="group" aria-label={t.grantQuickAmountsLabel} className="flex gap-2 pt-1">
                {QUICK_AMOUNTS.map((value) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setAmount(String(value))}
                    disabled={isPending}
                    aria-pressed={amount === String(value)}
                    className={cn("border border-border", amount === String(value) && "bg-navy/5")}
                  >
                    {value}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor={noteId} className="text-sm font-medium text-navy">
                {t.grantNoteLabel}
              </label>
              <textarea
                id={noteId}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={t.grantNotePlaceholder}
                rows={2}
                maxLength={500}
                disabled={isPending}
                className="w-full rounded-md border border-border bg-canvas p-2.5 text-sm text-ink shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
              />
            </div>
          </>
        )}

        {errorMessage && (
          <p role="alert" className="text-sm text-red-600">
            {errorMessage}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          {success ? (
            <Button type="button" size="sm" onClick={onClose}>
              {t.grantDone}
            </Button>
          ) : (
            <>
              <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={isPending}>
                {t.grantCancel}
              </Button>
              <Button type="button" size="sm" onClick={handleConfirm} disabled={isPending || !requestId}>
                {isPending ? t.granting : t.grantConfirm}
              </Button>
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}
