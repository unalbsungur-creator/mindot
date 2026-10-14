"use client";

import Link from "next/link";
import { PageContainer } from "@/components/layout/PageContainer";
import { Badge } from "@/components/ui/Badge";
import type { TokenHistoryAccount, TokenHistoryResult, TokenHistoryRow } from "@/features/tokens/history";
import type { TokenLedgerType } from "@/features/tokens/types";
import { useLocale } from "@/i18n/LocaleProvider";
import type { Dictionary } from "@/i18n/translations/types";
import { cn } from "@/lib/cn";

interface TokenHistoryPageContentProps {
  result: TokenHistoryResult;
  isFirstPage: boolean;
}

const TYPE_BADGE_CLASSES: Record<TokenLedgerType, string> = {
  grant: "border-navy/20 bg-navy/5 text-navy",
  purchase: "border-emerald-200 bg-emerald-50 text-emerald-800",
  subscription: "border-sky-200 bg-sky-50 text-sky-800",
  consume: "border-orange/30 bg-orange-tint/60 text-orange-ink",
  refund: "border-violet-200 bg-violet-50 text-violet-800",
  adjustment: "border-border bg-canvas text-ink-soft",
};

function typeLabel(type: TokenLedgerType, labels: Dictionary["tokenHistoryAdmin"]): string {
  switch (type) {
    case "grant":
      return labels.typeGrant;
    case "purchase":
      return labels.typePurchase;
    case "subscription":
      return labels.typeSubscription;
    case "consume":
      return labels.typeConsume;
    case "refund":
      return labels.typeRefund;
    case "adjustment":
      return labels.typeAdjustment;
  }
}

export function TokenHistoryPageContent({ result, isFirstPage }: TokenHistoryPageContentProps) {
  const { dictionary } = useLocale();
  const labels = dictionary.tokenHistoryAdmin;

  if (result.status === "unauthorized") {
    return (
      <div className="flex min-h-page-panel items-center justify-center py-16">
        <PageContainer className="mx-auto flex max-w-md flex-col items-center gap-3 text-center">
          <h1 className="font-display text-2xl font-medium text-navy">{labels.unauthorizedTitle}</h1>
          <p className="text-ink-soft">{labels.unauthorizedBody}</p>
        </PageContainer>
      </div>
    );
  }

  return (
    <PageContainer className="py-16">
      <div className="mx-auto flex max-w-3xl flex-col gap-2 pb-8">
        <h1 className="font-display text-3xl font-medium text-navy sm:text-4xl">{labels.title}</h1>
        <p className="text-ink-soft">{labels.subtitle}</p>
        <p className="text-xs text-ink-soft">{labels.orderingNote}</p>
      </div>

      {result.rows.length === 0 ? (
        <div className="mx-auto flex max-w-md flex-col items-center gap-2 py-12 text-center">
          <p className="font-medium text-navy">{isFirstPage ? labels.emptyTitle : labels.endTitle}</p>
          {isFirstPage && <p className="text-sm text-ink-soft">{labels.emptyBody}</p>}
        </div>
      ) : (
        <ol className="flex flex-col gap-3">
          {result.rows.map((row) => (
            <li key={row.id}>
              <LedgerRowCard row={row} labels={labels} />
            </li>
          ))}
        </ol>
      )}

      <nav aria-label={labels.paginationLabel} className="flex flex-wrap items-center justify-between gap-3 pt-8">
        {isFirstPage ? (
          <span />
        ) : (
          <Link href="/admin/tokens" className="text-sm font-medium text-ink-soft hover:text-navy">
            {labels.newestPage}
          </Link>
        )}
        {result.nextCursor && (
          <Link
            href={`/admin/tokens?cursor=${encodeURIComponent(result.nextCursor)}`}
            className="text-sm font-medium text-navy hover:text-orange"
          >
            {labels.olderPage}
          </Link>
        )}
      </nav>
    </PageContainer>
  );
}

function AccountLabel({ account, labels }: { account: TokenHistoryAccount; labels: Dictionary["tokenHistoryAdmin"] }) {
  if (account.kind === "deleted") return <span className="italic text-ink-soft">{labels.deletedAccount}</span>;
  return (
    <span className="break-words">
      <span className="font-medium text-navy">{account.name ?? account.email}</span>
      {account.name && <span className="text-ink-soft"> · {account.email}</span>}
    </span>
  );
}

function LedgerRowCard({ row, labels }: { row: TokenHistoryRow; labels: Dictionary["tokenHistoryAdmin"] }) {
  const isCredit = row.amount > 0;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className={cn("normal-case", TYPE_BADGE_CLASSES[row.type])}>{typeLabel(row.type, labels)}</Badge>
        <span
          className={cn("font-semibold tabular-nums", isCredit ? "text-emerald-700" : "text-red-700")}
          aria-label={`${isCredit ? labels.creditLabel : labels.debitLabel} ${Math.abs(row.amount)}`}
        >
          {isCredit ? `+${row.amount}` : `−${Math.abs(row.amount)}`}
        </span>
        <span className="text-xs text-ink-soft">
          {labels.balanceAfterLabel}: <span className="font-medium text-navy tabular-nums">{row.balanceAfter}</span>
        </span>
        <time dateTime={row.createdAt} className="ml-auto text-xs text-ink-soft">
          {new Date(row.createdAt).toLocaleString()}
        </time>
      </div>

      <p className="text-xs text-ink-soft">
        {labels.userLabel}: <AccountLabel account={row.user} labels={labels} />
      </p>
      {row.createdBy && (
        <p className="text-xs text-ink-soft">
          {labels.createdByLabel}: <AccountLabel account={row.createdBy} labels={labels} />
        </p>
      )}
      {row.note && (
        <p className="break-words text-xs text-ink-soft">
          {labels.noteLabel}: <span className="text-navy">{row.note}</span>
        </p>
      )}
      {(row.externalProvider || row.externalReference) && (
        <p className="break-words text-xs text-ink-soft">
          {labels.externalLabel}:{" "}
          <span className="text-navy">{[row.externalProvider, row.externalReference].filter(Boolean).join(" · ")}</span>
        </p>
      )}
    </div>
  );
}
