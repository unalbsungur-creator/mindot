"use client";

import { useEffect, useId, useRef, useState, useTransition, type MouseEvent } from "react";
import { Button } from "@/components/ui/Button";
import { recordShopierPurchase } from "@/features/tokens/admin-actions";
import {
  EMPTY_SHOPIER_PURCHASE_FORM,
  buildShopierPurchasePayload,
  packageOptionLabel,
  shopierPurchaseFormErrorMessage,
  shopierPurchaseOutcome,
  validateShopierPurchaseForm,
  type ShopierPurchaseFormValues,
  type TokenPackageOption,
} from "@/features/tokens/lib/shopierPurchaseForm";
import { MAX_MANUAL_REVIEW_REASON_LENGTH, MAX_PURCHASE_NOTE_LENGTH } from "@/features/tokens/lib/shopierPurchase";
import { useLocale } from "@/i18n/LocaleProvider";

const FIELD_CLASS =
  "w-full rounded-md border border-border bg-canvas p-2.5 text-sm text-ink shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange disabled:opacity-60";

/**
 * Admin "Record Shopier purchase" step on /admin/users (Token Al V1, manual
 * model) — separate from `GrantTokensDialog`, same native `<dialog>`
 * foundation. The admin picks a package (its amount and price come from the
 * server's package list, passed in as `packages`), types the Shopier order
 * number and the buyer's email, and ticks manual review with a reason only
 * when the emails differ. `recordShopierPurchase` re-checks everything; the
 * order number is the idempotency key, so a double submit or a retry after
 * a lost response can never credit twice. The buyer's email is only sent
 * for comparison — never logged or echoed in a message.
 */
export function RecordShopierPurchaseDialog({
  open,
  userId,
  userLabel,
  accountEmail,
  packages,
  userLabelFor,
  onClose,
  onRecorded,
}: {
  open: boolean;
  userId: string;
  userLabel: string;
  accountEmail: string;
  packages: TokenPackageOption[];
  /** Names a user the page lists (for "order already used"); null otherwise. */
  userLabelFor: (userId: string) => string | null;
  onClose: () => void;
  onRecorded: (balance: number) => void;
}) {
  const { dictionary, locale } = useLocale();
  const t = dictionary.usersAdmin;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const packageId = useId();
  const orderId = useId();
  const orderHintId = useId();
  const emailId = useId();
  const emailHintId = useId();
  const manualId = useId();
  const manualHintId = useId();
  const reasonId = useId();
  const noteId = useId();
  const [values, setValues] = useState<ShopierPurchaseFormValues>(EMPTY_SHOPIER_PURCHASE_FORM);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (open) {
      // A fresh form per opening; within one opening, inputs survive every error.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setValues({ ...EMPTY_SHOPIER_PURCHASE_FORM, packageId: packages[0]?.id ?? "" });
      setError(null);
      setSuccess(null);
    }
  }, [open, packages]);

  function update<K extends keyof ShopierPurchaseFormValues>(key: K, value: ShopierPurchaseFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === dialogRef.current && !isPending) onClose();
  }

  function handleSubmit() {
    if (isPending) return;
    const invalid = validateShopierPurchaseForm(
      values,
      packages.map((pkg) => pkg.id)
    );
    if (invalid) {
      setError(shopierPurchaseFormErrorMessage(t, invalid));
      return;
    }
    setError(null);
    const payload = buildShopierPurchasePayload(userId, values);
    startTransition(async () => {
      try {
        const result = await recordShopierPurchase(payload);
        const outcome = shopierPurchaseOutcome(result, {
          t,
          deletedAccountLabel: dictionary.tokenHistoryAdmin.deletedAccount,
          locale,
          userLabelFor,
        });
        if (outcome.kind === "success") {
          setSuccess(outcome.message);
          onRecorded(outcome.balance);
        } else {
          setError(outcome.message);
        }
      } catch {
        // Network/server failure. Nothing is logged (the form holds an email);
        // the inputs stay, and a retry is safe — the order number is the key.
        setError(t.recordPurchaseErrorFailed);
      }
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
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-lg border border-border bg-surface p-0 shadow-card backdrop:bg-navy/50 backdrop:backdrop-blur-sm"
    >
      <form
        className="flex flex-col gap-4 p-5 sm:p-6"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          handleSubmit();
        }}
      >
        <h2 id={headingId} className="font-display text-lg font-medium text-navy">
          {t.recordPurchaseTitle}
        </h2>
        <p className="text-sm leading-relaxed text-ink-soft">{t.recordPurchaseBody.replace("{name}", userLabel)}</p>
        <p className="break-all text-xs text-ink-soft">{t.recordPurchaseAccountEmail.replace("{email}", accountEmail)}</p>

        {success ? (
          <p role="status" className="text-sm text-navy">
            {success}
          </p>
        ) : (
          <fieldset disabled={isPending} className="flex min-w-0 flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={packageId} className="text-sm font-medium text-navy">
                {t.recordPurchasePackageLabel}
              </label>
              <select
                id={packageId}
                value={values.packageId}
                onChange={(event) => update("packageId", event.target.value)}
                className={FIELD_CLASS}
              >
                {packages.map((pkg) => (
                  <option key={pkg.id} value={pkg.id}>
                    {packageOptionLabel(t, pkg, locale)}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor={orderId} className="text-sm font-medium text-navy">
                {t.recordPurchaseOrderLabel}
              </label>
              <input
                id={orderId}
                type="text"
                required
                autoComplete="off"
                spellCheck={false}
                maxLength={64}
                value={values.orderRef}
                onChange={(event) => update("orderRef", event.target.value)}
                aria-describedby={orderHintId}
                className={FIELD_CLASS}
              />
              <p id={orderHintId} className="text-xs text-ink-soft">
                {t.recordPurchaseOrderHint}
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor={emailId} className="text-sm font-medium text-navy">
                {t.recordPurchaseBuyerEmailLabel}
              </label>
              <input
                id={emailId}
                type="email"
                required
                autoComplete="off"
                spellCheck={false}
                maxLength={254}
                value={values.buyerEmail}
                onChange={(event) => update("buyerEmail", event.target.value)}
                aria-describedby={emailHintId}
                className={FIELD_CLASS}
              />
              <p id={emailHintId} className="text-xs text-ink-soft">
                {t.recordPurchaseBuyerEmailHint}
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-start gap-2">
                <input
                  id={manualId}
                  type="checkbox"
                  checked={values.manualReview}
                  onChange={(event) => update("manualReview", event.target.checked)}
                  aria-describedby={manualHintId}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-navy"
                />
                <label htmlFor={manualId} className="text-sm font-medium text-navy">
                  {t.recordPurchaseManualReviewLabel}
                </label>
              </div>
              <p id={manualHintId} className="text-xs text-ink-soft">
                {t.recordPurchaseManualReviewHint}
              </p>
            </div>

            {values.manualReview && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor={reasonId} className="text-sm font-medium text-navy">
                  {t.recordPurchaseReasonLabel}
                </label>
                <textarea
                  id={reasonId}
                  required
                  rows={2}
                  maxLength={MAX_MANUAL_REVIEW_REASON_LENGTH}
                  value={values.manualReviewReason}
                  onChange={(event) => update("manualReviewReason", event.target.value)}
                  placeholder={t.recordPurchaseReasonPlaceholder}
                  className={FIELD_CLASS}
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label htmlFor={noteId} className="text-sm font-medium text-navy">
                {t.recordPurchaseNoteLabel}
              </label>
              <textarea
                id={noteId}
                rows={2}
                maxLength={MAX_PURCHASE_NOTE_LENGTH}
                value={values.note}
                onChange={(event) => update("note", event.target.value)}
                placeholder={t.recordPurchaseNotePlaceholder}
                className={FIELD_CLASS}
              />
            </div>
          </fieldset>
        )}

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          {success ? (
            <Button type="button" size="sm" onClick={onClose}>
              {t.recordPurchaseDone}
            </Button>
          ) : (
            <>
              <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={isPending}>
                {t.recordPurchaseCancel}
              </Button>
              <Button type="submit" size="sm" disabled={isPending || packages.length === 0}>
                {isPending ? t.recordPurchaseSubmitting : t.recordPurchaseConfirm}
              </Button>
            </>
          )}
        </div>
      </form>
    </dialog>
  );
}
