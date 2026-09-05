"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { Button } from "@/components/ui/Button";
import { getAnonymousId } from "@/lib/anonymousId";
import { useLocale } from "@/i18n/LocaleProvider";
import type { Dictionary } from "@/i18n/translations";
import { reportMessage, type ReportMessageError } from "../actions";
import { REPORT_REASONS, type ReportReason } from "../types";

function reasonLabel(dictionary: Dictionary, reason: ReportReason): string {
  return {
    spam: dictionary.report.reasonSpam,
    harassment: dictionary.report.reasonHarassment,
    hate: dictionary.report.reasonHate,
    sexual_content: dictionary.report.reasonSexualContent,
    violence: dictionary.report.reasonViolence,
    illegal: dictionary.report.reasonIllegal,
    copyright: dictionary.report.reasonCopyright,
    other: dictionary.report.reasonOther,
  }[reason];
}

function errorMessage(dictionary: Dictionary, error: ReportMessageError | undefined): string {
  if (error === "already-reported") return dictionary.report.errorAlreadyReported;
  if (error === "not-found") return dictionary.report.errorNotFound;
  if (error === "rate-limited") return dictionary.report.errorRateLimited;
  return dictionary.report.errorGeneric;
}

interface ReportDialogProps {
  open: boolean;
  messageId: string | null;
  onClose: () => void;
}

/**
 * The public report entry point — same native `<dialog>` foundation as
 * `ConfirmDialog` (top-layer stacking, focus trapping, Escape-to-close for
 * free), extended into a real small form since a report needs a reason and
 * optional details rather than a single confirm/cancel choice. One
 * instance is mounted by the board (see InfiniteBoard.tsx), reused across
 * every note rather than one per card — `messageId` tells it which message
 * the current submission is about.
 */
export function ReportDialog({ open, messageId, onClose }: ReportDialogProps) {
  const { dictionary } = useLocale();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const detailsId = useId();

  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [phase, setPhase] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [error, setError] = useState<ReportMessageError | undefined>(undefined);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Reset the form fresh every time the dialog opens for a (possibly
  // different) message — a stale reason/details from a previous report
  // must never carry over silently. Synchronizing local form state with an
  // external open/close signal is exactly what an effect is for here (same
  // justified exception as WriteThoughtForm's own draft-restore effect).
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setReason(null);
      setDetails("");
      setPhase("idle");
      setError(undefined);
    }
  }, [open, messageId]);

  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === dialogRef.current && phase !== "submitting") onClose();
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!reason || !messageId || phase === "submitting") return;

    setPhase("submitting");
    setError(undefined);
    const result = await reportMessage({ messageId, reason, details, anonymousId: getAnonymousId() });
    if (!result.ok) {
      setPhase("error");
      setError(result.error);
      return;
    }
    setPhase("success");
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={headingId}
      onCancel={(event) => {
        event.preventDefault();
        if (phase !== "submitting") onClose();
      }}
      onClick={handleBackdropClick}
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-lg border border-border bg-surface p-0 shadow-card backdrop:bg-navy/50 backdrop:backdrop-blur-sm"
    >
      {phase === "success" ? (
        <div className="flex flex-col gap-4 p-5 sm:p-6">
          <h2 id={headingId} className="font-display text-lg font-medium text-navy">
            {dictionary.report.successTitle}
          </h2>
          <p className="text-sm leading-relaxed text-ink-soft">{dictionary.report.successBody}</p>
          <div className="flex justify-end pt-1">
            <Button type="button" size="sm" onClick={onClose}>
              {dictionary.report.close}
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-5 sm:p-6">
          <div className="flex flex-col gap-1">
            <h2 id={headingId} className="font-display text-lg font-medium text-navy">
              {dictionary.report.dialogTitle}
            </h2>
            <p className="text-sm leading-relaxed text-ink-soft">{dictionary.report.dialogSubtitle}</p>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-navy">{dictionary.report.reasonLegend}</legend>
            {REPORT_REASONS.map((value) => (
              <label key={value} className="flex cursor-pointer items-center gap-2 text-sm text-ink">
                <input
                  type="radio"
                  name="report-reason"
                  value={value}
                  checked={reason === value}
                  onChange={() => setReason(value)}
                  required
                  className="h-4 w-4 shrink-0 cursor-pointer accent-orange focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                />
                {reasonLabel(dictionary, value)}
              </label>
            ))}
          </fieldset>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={detailsId} className="text-sm font-medium text-navy">
              {dictionary.report.detailsLabel}
            </label>
            <textarea
              id={detailsId}
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              placeholder={dictionary.report.detailsPlaceholder}
              rows={3}
              maxLength={500}
              className="w-full rounded-md border border-border bg-canvas p-2.5 text-sm text-ink shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
            />
          </div>

          {phase === "error" && (
            <p role="alert" className="text-sm text-red-600">
              {errorMessage(dictionary, error)}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={phase === "submitting"}>
              {dictionary.report.cancel}
            </Button>
            <Button type="submit" size="sm" disabled={!reason || phase === "submitting"}>
              {phase === "submitting" ? dictionary.report.submitting : dictionary.report.submit}
            </Button>
          </div>
        </form>
      )}
    </dialog>
  );
}
