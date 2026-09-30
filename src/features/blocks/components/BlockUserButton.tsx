"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { blockUser, unblockUser } from "@/features/blocks/actions";
import { useLocale } from "@/i18n/LocaleProvider";
import { cn } from "@/lib/cn";

/**
 * Block (with a confirm step) or unblock (immediate — nothing is lost by
 * it) one user, by public id. On success the current route re-renders from
 * the server, which is where every block-aware read happens — this
 * component never hides content itself.
 */
export function BlockUserButton({
  publicId,
  displayName,
  blocked,
  className,
}: {
  publicId: string;
  displayName: string;
  blocked: boolean;
  className?: string;
}) {
  const { dictionary } = useLocale();
  const t = dictionary.blocking;
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [isPending, startTransition] = useTransition();

  function run(action: () => ReturnType<typeof blockUser>) {
    setFailed(false);
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          setFailed(true);
          return;
        }
        setConfirmOpen(false);
        router.refresh();
      } catch {
        setFailed(true);
      }
    });
  }

  const buttonClass = cn(
    "inline-flex min-h-11 items-center rounded-pill px-3 text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange disabled:opacity-50",
    blocked ? "text-navy" : "text-red-700",
    className
  );

  if (blocked) {
    return (
      <span className="inline-flex flex-col items-center gap-1">
        <button type="button" className={buttonClass} disabled={isPending} onClick={() => run(() => unblockUser({ publicId }))}>
          {isPending ? t.unblocking : t.unblockAction}
        </button>
        {failed && (
          <span role="alert" className="text-xs text-red-600">
            {t.errorGeneric}
          </span>
        )}
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        className={buttonClass}
        onClick={() => {
          setFailed(false);
          setConfirmOpen(true);
        }}
      >
        {t.blockAction}
      </button>
      <ConfirmDialog
        open={confirmOpen}
        title={t.confirmTitle.replace("{name}", displayName)}
        body={failed ? t.errorGeneric : t.confirmBody}
        cancelLabel={t.cancel}
        confirmLabel={isPending ? t.blocking : t.confirmButton}
        confirmDisabled={isPending}
        onConfirm={() => run(() => blockUser({ publicId }))}
        onCancel={() => {
          if (!isPending) setConfirmOpen(false);
        }}
      />
    </>
  );
}
