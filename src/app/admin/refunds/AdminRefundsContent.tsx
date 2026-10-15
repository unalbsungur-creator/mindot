"use client";

import { useLocale } from "@/i18n/LocaleProvider";

type RefundStatus = "pending_external_refund" | "external_refund_confirmed" | "cancelled";
type RefundRow = {
  id: string; status: RefundStatus; amountKurus: number; tokensReversed: number;
  externalReference: string | null; createdAt: string; confirmedAt: string | null;
  orderReference: string; packageId: string; userEmail: string | null;
};
type PurchaseRow = {
  id: string; orderReference: string; packageId: string; packageTokens: number; allocatedTokens: number; remainingRecordedTokens: number | null;
  paidAmountKurus: number; paymentApprovedAt: string | null; createdAt: string; userEmail: string | null;
};

function money(kurus: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "TRY" }).format(kurus / 100);
}
function date(value: string | null, locale: string): string {
  return value ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Istanbul" }).format(new Date(value)) : "—";
}

export function AdminRefundsContent({ refunds, purchases, authorized }: { refunds: RefundRow[]; purchases: PurchaseRow[]; authorized: boolean }) {
  const { dictionary, locale } = useLocale();
  const labels = dictionary.adminRefunds;
  const statusLabels: Record<RefundStatus, string> = {
    pending_external_refund: labels.pending,
    external_refund_confirmed: labels.confirmed,
    cancelled: labels.cancelled,
  };

  if (!authorized) return <main className="mx-auto max-w-5xl px-4 py-10"><h1 className="text-2xl font-semibold">{labels.title}</h1><p className="mt-3">{labels.unauthorized}</p></main>;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold text-ink">{labels.title}</h1>
      <p className="mt-2 max-w-3xl text-sm text-ink-soft">{labels.intro}</p>
      <div className="mt-6 overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[900px] border-collapse text-left text-sm">
          <thead className="bg-canvas text-ink-soft"><tr>
            {[labels.orderUser, labels.status, labels.recordedAmount, labels.tokensReversed, labels.refundReference, labels.createdAt, labels.confirmedAt].map((label) => <th key={label} className="px-4 py-3 font-medium">{label}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-border">
            {refunds.map((row) => <tr key={row.id} className="align-top">
              <td className="px-4 py-3"><div className="font-medium text-ink">{row.orderReference}</div><div className="mt-1 text-xs text-ink-soft">{row.userEmail}</div><div className="mt-1 text-xs text-ink-soft">{row.packageId}</div></td>
              <td className="px-4 py-3">{statusLabels[row.status] ?? labels.unknown}</td>
              <td className="px-4 py-3 tabular-nums">{money(row.amountKurus, locale)}</td>
              <td className="px-4 py-3 tabular-nums">{row.tokensReversed}</td>
              <td className="px-4 py-3 break-all">{row.externalReference ?? "—"}</td>
              <td className="px-4 py-3 whitespace-nowrap">{date(row.createdAt, locale)}</td>
              <td className="px-4 py-3 whitespace-nowrap">{date(row.confirmedAt, locale)}</td>
            </tr>)}
            {refunds.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-ink-soft">{labels.noRefunds}</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-ink-soft">{labels.refundFooter}</p>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-ink">{labels.purchasesTitle}</h2>
        <p className="mt-2 max-w-3xl text-sm text-ink-soft">{labels.purchasesIntro}</p>
        <div className="mt-4 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[980px] border-collapse text-left text-sm">
            <thead className="bg-canvas text-ink-soft"><tr>
              {[labels.orderUser, labels.package, labels.tokens, labels.allocatedTokens, labels.remainingRecordedTokens, labels.paidAmount, labels.paymentApprovedAt, labels.purchaseCreatedAt].map((label) => <th key={label} className="px-4 py-3 font-medium">{label}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-border">
              {purchases.map((purchase) => <tr key={purchase.id} className="align-top">
                <td className="px-4 py-3"><div className="font-medium text-ink">{purchase.orderReference}</div><div className="mt-1 text-xs text-ink-soft">{purchase.userEmail}</div></td>
                <td className="px-4 py-3">{purchase.packageId}</td>
                <td className="px-4 py-3 tabular-nums">{purchase.packageTokens}</td>
                <td className="px-4 py-3 tabular-nums">{purchase.allocatedTokens}</td>
                <td className="px-4 py-3 tabular-nums">{purchase.remainingRecordedTokens === null ? labels.allocationInconsistent : purchase.remainingRecordedTokens}</td>
                <td className="px-4 py-3 tabular-nums">{money(purchase.paidAmountKurus, locale)}</td>
                <td className="px-4 py-3 whitespace-nowrap">{date(purchase.paymentApprovedAt, locale)}</td>
                <td className="px-4 py-3 whitespace-nowrap">{date(purchase.createdAt, locale)}</td>
              </tr>)}
              {purchases.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-ink-soft">{labels.noPurchases}</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-ink-soft">{labels.purchaseFooter}</p>
      </section>
    </main>
  );
}
