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
}

/**
 * A small, generic confirm step — built on a native `<dialog>` for the
 * same reasons OnboardingModal already is (top-layer stacking, focus
 * trapping, Escape-to-close for free), just much simpler: one heading,
 * one body line, two buttons. Not a new admin design system — reuses the
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
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();

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
