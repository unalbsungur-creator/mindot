"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useLocale } from "@/i18n/LocaleProvider";
import type { Dictionary } from "@/i18n/translations";
import { cn } from "@/lib/cn";
import { unlockMemoryPdf, type UnlockMemoryPdfError } from "../actions";

interface PersonalPdfAccessProps {
  projectId: string;
  /** Re-derived from memory_pdf_unlocks on every page load — any source (token, legacy_grandfathered, …) counts. */
  unlocked: boolean;
  /** The signed-in user's wallet balance, read server-side. Shared across every panel on the page. */
  balance: number;
  /**
   * Whether the source message is still public (approved, fully placed) —
   * the server-side `getPublicMessageById` result, the same check
   * `generateMemoryPdf` enforces. When false (e.g. the note was archived),
   * no download or Token action is offered; an existing unlock is kept
   * untouched and works again if the note is restored.
   */
  sourceAvailable: boolean;
  onUnlocked: (projectId: string, balance: number) => void;
  onBalanceChange: (balance: number) => void;
  className?: string;
}

const unlockErrorMessage = (dictionary: Dictionary): Record<UnlockMemoryPdfError, string> => ({
  "auth-required": dictionary.write.signInRequired,
  "not-found": dictionary.memory.pdfUnlockError,
  forbidden: dictionary.memory.pdfUnlockError,
  "not-eligible": dictionary.memory.pdfUnlockError,
  "message-not-eligible": dictionary.memory.notEligibleBody,
  "insufficient-tokens": dictionary.memory.pdfInsufficientTokens,
  "unlock-conflict": dictionary.memory.pdfUnlockError,
});

/**
 * The one personal_pdf access control — used by /memory/[messageId] and
 * /me/memories. Three states: unlocked → View/Download (re-downloads are
 * free, the download route only reads the unlock); locked with balance ≥ 1
 * → "Unlock with 1 Token" behind a ConfirmDialog, calling the server-side
 * `unlockMemoryPdf`; locked with balance 0 → explanation only, no dead
 * button or download link. A source note that's no longer public (e.g.
 * archived) overrides all three: no download, no Token action. The UI only reflects state — the server decides
 * ownership, eligibility, and whether a token is actually spent.
 */
export function PersonalPdfAccess({
  projectId,
  unlocked,
  balance,
  sourceAvailable,
  onUnlocked,
  onBalanceChange,
  className,
}: PersonalPdfAccessProps) {
  const { dictionary } = useLocale();
  const t = dictionary.memory;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<UnlockMemoryPdfError | null>(null);
  const [isPending, startTransition] = useTransition();

  const balanceLabel = t.pdfTokenBalance.replace("{count}", String(balance));

  function handleConfirm() {
    if (isPending) return;
    setError(null);
    startTransition(async () => {
      const result = await unlockMemoryPdf(projectId);
      setConfirmOpen(false);
      if (result.ok && result.data) {
        onUnlocked(projectId, result.data.balance);
        return;
      }
      const code = result.error ?? "unlock-conflict";
      // The server refused because the balance is below 1 — for an
      // integer, non-negative balance that means 0.
      if (code === "insufficient-tokens") onBalanceChange(0);
      setError(code);
    });
  }

  if (!sourceAvailable) {
    return <p className={cn("max-w-xs text-sm text-ink-soft", className)}>{t.notEligibleTitle}</p>;
  }

  if (unlocked) {
    return (
      <div className={cn("flex flex-col gap-2", className)}>
        <p className="text-sm text-navy">{t.pdfReady}</p>
        <div className="flex flex-wrap items-center gap-2">
          {/* nativeLink: plain <a>, so Next never prefetches or client-fetches the PDF route. */}
          <Button
            href={`/api/memories/${projectId}/download?disposition=inline`}
            nativeLink
            target="_blank"
            rel="noopener noreferrer"
            variant="ghost"
            size="sm"
          >
            {dictionary.adminOrders.viewPdfButton}
          </Button>
          <Button href={`/api/memories/${projectId}/download`} nativeLink size="sm">
            {dictionary.adminOrders.downloadPdfButton}
          </Button>
        </div>
        <p className="text-xs text-ink-soft">{balanceLabel}</p>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <p className="text-xs font-medium text-ink-soft">{t.pdfPriceNote}</p>
      {balance >= 1 ? (
        <Button size="sm" onClick={() => setConfirmOpen(true)} disabled={isPending}>
          {isPending ? t.pdfUnlocking : t.pdfUnlockButton}
        </Button>
      ) : (
        <p className="max-w-xs text-sm text-orange-ink">{t.pdfUnlockRequired}</p>
      )}
      <p className="text-xs text-ink-soft">{balanceLabel}</p>
      {error && <p className="text-sm text-red-600">{unlockErrorMessage(dictionary)[error]}</p>}
      <ConfirmDialog
        open={confirmOpen}
        title={t.pdfUnlockConfirmTitle}
        body={t.pdfUnlockConfirmBody}
        cancelLabel={t.pdfUnlockCancel}
        confirmLabel={isPending ? t.pdfUnlocking : t.pdfUnlockConfirmButton}
        confirmDisabled={isPending}
        onConfirm={handleConfirm}
        onCancel={() => {
          if (!isPending) setConfirmOpen(false);
        }}
      />
    </div>
  );
}
