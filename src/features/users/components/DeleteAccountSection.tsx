"use client";

import { useEffect, useId, useRef, useState, useTransition, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { deleteOwnAccount, type DeleteAccountError } from "@/features/users/account-actions";
import { useLocale } from "@/i18n/LocaleProvider";

type Step = "closed" | "explain" | "confirm" | "done";

/**
 * The /me "Delete account" entry point — two deliberate steps on one
 * native `<dialog>` (same foundation as SuspendDialog): first what happens,
 * then retyping the account's email. The email match here only enables the
 * button; `deleteOwnAccount` re-checks it server-side against the session's
 * own account. After success the session is already gone, so the dialog
 * can only lead home, where the header re-reads the (now empty) session.
 */
export function DeleteAccountSection({ email }: { email: string }) {
  const { dictionary } = useLocale();
  const t = dictionary.accountDeletion;
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const emailId = useId();
  const [step, setStep] = useState<Step>("closed");
  const [typedEmail, setTypedEmail] = useState("");
  const [error, setError] = useState<DeleteAccountError | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (step !== "closed" && !dialog.open) dialog.showModal();
    if (step === "closed" && dialog.open) dialog.close();
  }, [step]);

  function open() {
    setTypedEmail("");
    setError(null);
    setStep("explain");
  }

  function goHome() {
    // replace: /me is gone for this visitor, so Back shouldn't return to it.
    // refresh: drops the router's cached, signed-in render of every route.
    router.replace("/");
    router.refresh();
  }

  function close() {
    if (isPending) return;
    if (step === "done") goHome();
    else setStep("closed");
  }

  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === dialogRef.current) close();
  }

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await deleteOwnAccount(typedEmail);
        if (!result.ok) {
          setError(result.error ?? "failed");
          return;
        }
        setStep("done");
      } catch {
        setError("failed");
      }
    });
  }

  const errorMessage: Record<DeleteAccountError, string> = {
    "confirmation-mismatch": t.errorMismatch,
    "auth-required": t.errorAuth,
    "admin-account": t.errorAdmin,
    "apple-revoke-failed": t.errorAppleRevoke,
    failed: t.errorFailed,
  };
  const emailMatches = typedEmail.trim().toLowerCase() === email.trim().toLowerCase();

  return (
    <section aria-labelledby={`${headingId}-section`} className="mx-auto flex w-full max-w-md flex-col items-center gap-2 border-t border-border pt-6 text-center">
      <h2 id={`${headingId}-section`} className="text-sm font-medium text-navy">
        {t.sectionTitle}
      </h2>
      <p className="text-xs text-ink-soft">{t.sectionBody}</p>
      <button
        type="button"
        onClick={open}
        className="mt-1 inline-flex min-h-11 items-center rounded-pill px-4 text-sm font-medium text-red-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
      >
        {t.openButton}
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={headingId}
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onClick={handleBackdropClick}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-lg border border-border bg-surface p-0 text-left shadow-card backdrop:bg-navy/50 backdrop:backdrop-blur-sm"
      >
        <div className="flex flex-col gap-4 p-5 sm:p-6">
          {step === "explain" && (
            <>
              <h2 id={headingId} className="font-display text-lg font-medium text-navy">
                {t.step1Title}
              </h2>
              <p className="text-sm font-medium text-navy">{t.step1Intro}</p>
              <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed text-ink-soft">
                <li>{t.itemDeleted}</li>
                <li>{t.itemAnonymized}</li>
                <li>{t.itemRetained}</li>
                <li>{t.itemTokens}</li>
              </ul>
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="ghost" size="sm" onClick={close}>
                  {t.cancelButton}
                </Button>
                <Button type="button" size="sm" onClick={() => setStep("confirm")}>
                  {t.continueButton}
                </Button>
              </div>
            </>
          )}

          {step === "confirm" && (
            <>
              <h2 id={headingId} className="font-display text-lg font-medium text-navy">
                {t.step2Title}
              </h2>
              <div className="flex flex-col gap-1.5">
                <label htmlFor={emailId} className="text-sm leading-relaxed text-ink-soft">
                  {t.step2Instruction.replace("{email}", email)}
                </label>
                <input
                  id={emailId}
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder={t.emailLabel}
                  value={typedEmail}
                  onChange={(event) => setTypedEmail(event.target.value)}
                  disabled={isPending}
                  className="w-full rounded-md border border-border bg-canvas p-2.5 text-base text-ink shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange sm:text-sm"
                />
              </div>
              {error && (
                <p role="alert" className="text-sm text-red-600">
                  {errorMessage[error]}
                </p>
              )}
              <div className="flex flex-wrap justify-end gap-2 pt-1">
                <Button type="button" variant="ghost" size="sm" onClick={() => setStep("explain")} disabled={isPending}>
                  {t.backButton}
                </Button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={!emailMatches || isPending}
                  className="inline-flex items-center justify-center rounded-pill bg-red-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
                >
                  {isPending ? t.deleting : t.confirmButton}
                </button>
              </div>
            </>
          )}

          {step === "done" && (
            <>
              <h2 id={headingId} className="font-display text-lg font-medium text-navy">
                {t.successTitle}
              </h2>
              <p role="status" className="text-sm leading-relaxed text-ink-soft">
                {t.successBody}
              </p>
              <div className="flex justify-end pt-1">
                <Button type="button" size="sm" onClick={goHome}>
                  {t.successButton}
                </Button>
              </div>
            </>
          )}
        </div>
      </dialog>
    </section>
  );
}
