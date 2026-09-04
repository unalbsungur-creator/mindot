"use client";

import { useEffect, useId, useRef, type MouseEvent } from "react";
import { Button } from "./Button";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body: string;
  cancelLabel: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmDisabled?: boolean;
  /**
   * EPIC 014: an optional reason textarea, rendered between `body` and the
   * button row only when `reasonLabel` is provided — every existing caller
   * that doesn't pass these props is completely unaffected (no textarea,
   * identical layout to before). `onConfirm` still takes no arguments: the
   * caller already owns `reasonValue` in its own state, so it reads that
   * same value when `onConfirm` fires rather than receiving it back here.
   */
  reasonLabel?: string;
  reasonPlaceholder?: string;
  reasonValue?: string;
  onReasonChange?: (value: string) => void;
}

/**
 * A small, generic confirm step — built on a native `<dialog>` for the
 * same reasons OnboardingModal already is (top-layer stacking, focus
 * trapping, Escape-to-close for free), just much simpler: one heading,
 * one body line, two buttons (plus an optional reason textarea — see
 * `reasonLabel` above). Not a new admin design system — reuses the
 * existing `Button` component and the app's own surface/border tokens.
 * `open` is a controlled prop (showModal()/close() are imperative APIs,
 * so an effect bridges React state to them) so callers can reuse one
 * instance per row instead of managing dialog refs themselves.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  cancelLabel,
  confirmLabel,
  onConfirm,
  onCancel,
  confirmDisabled = false,
  reasonLabel,
  reasonPlaceholder,
  reasonValue,
  onReasonChange,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const reasonId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === dialogRef.current) onCancel();
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={headingId}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onClick={handleBackdropClick}
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-lg border border-border bg-surface p-0 shadow-card backdrop:bg-navy/50 backdrop:backdrop-blur-sm"
    >
      <div className="flex flex-col gap-4 p-5 sm:p-6">
        <h2 id={headingId} className="font-display text-lg font-medium text-navy">
          {title}
        </h2>
        <p className="text-sm leading-relaxed text-ink-soft">{body}</p>
        {reasonLabel && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={reasonId} className="text-sm font-medium text-navy">
              {reasonLabel}
            </label>
            <textarea
              id={reasonId}
              value={reasonValue ?? ""}
              onChange={(event) => onReasonChange?.(event.target.value)}
              placeholder={reasonPlaceholder}
              rows={3}
              maxLength={1000}
              className="w-full rounded-md border border-border bg-canvas p-2.5 text-sm text-ink shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
            />
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button type="button" size="sm" onClick={onConfirm} disabled={confirmDisabled}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
