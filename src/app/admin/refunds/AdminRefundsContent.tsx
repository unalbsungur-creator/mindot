"use client";

import { useState } from "react";
import { useLocale } from "@/i18n/LocaleProvider";
import { cancelTokenRefund, confirmTokenRefund, createTokenRefund } from "@/features/tokens/refund-actions";
import { calculateUnusedTokenRefundKurus } from "@/features/tokens/lib/refundMath";

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
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const statusLabels: Record<RefundStatus, string> = {
    pending_external_refund: labels.pending,
    external_refund_confirmed: labels.confirmed,
    cancelled: labels.cancelled,
  };

  async function createRefund(event: React.FormEvent<HTMLFormElement>, purchaseLotId: string) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const result = await createTokenRefund({
        purchaseLotId,
        requestId: crypto.randomUUID(),
      });
      setNotice(result.ok ? labels.actionSuccess : labels.actionError);
    } catch {
      setNotice(labels.actionError);
    } finally {
      setBusy(false);
    }
  }

  async function confirmRefund(event: React.FormEvent<HTMLFormElement>, refundId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setNotice(null);
    try {
      const result = await confirmTokenRefund({
        refundId,
        externalRefundReference: String(form.get("externalRefundReference") ?? ""),
      });
      setNotice(result.ok ? labels.actionSuccess : labels.actionError);
    } catch {
      setNotice(labels.actionError);
    } finally {
      setBusy(false);
    }
  }

  async function cancelRefund(refundId: string) {
    setBusy(true);
    setNotice(null);
    try {
      const result = await cancelTokenRefund({ refundId });
      setNotice(result.ok ? labels.actionSuccess : labels.actionError);
    } catch {
      setNotice(labels.actionError);
    } finally {
      setBusy(false);
    }
  }

  if (!authorized) return <main className="mx-auto max-w-5xl px-4 py-10"><h1 className="text-2xl font-semibold">{labels.title}</h1><p className="mt-3">{labels.unauthorized}</p></main>;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold text-ink">{labels.title}</h1>
      <p className="mt-2 max-w-3xl text-sm text-ink-soft">{labels.intro}</p>
      {notice && <p role="status" className="mt-4 rounded-lg border border-border p-3 text-sm">{notice}</p>}
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
              <td className="px-4 py-3 whitespace-nowrap">
                {date(row.confirmedAt, locale)}
                {row.status === "pending_external_refund" && <div className="mt-3 min-w-56 space-y-2">
                  <form onSubmit={(event) => confirmRefund(event, row.id)} className="space-y-2">
                    <label className="block text-xs">{labels.externalReferenceInput}
                      <input name="externalRefundReference" required maxLength={200} className="mt-1 w-full rounded border border-border bg-canvas px-2 py-1" />
                    </label>
                    <button disabled={busy} className="rounded bg-navy px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">{labels.confirmRefund}</button>
                  </form>
                  <button type="button" disabled={busy} onClick={() => void cancelRefund(row.id)} className="rounded border border-border px-3 py-1.5 text-xs disabled:opacity-50">{labels.cancelRefund}</button>
                </div>}
              </td>
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
          <table className="w-full min-w-[1220px] border-collapse text-left text-sm">
            <thead className="bg-canvas text-ink-soft"><tr>
              {[labels.orderUser, labels.package, labels.tokens, labels.allocatedTokens, labels.remainingRecordedTokens, labels.paidAmount, labels.paymentApprovedAt, labels.purchaseCreatedAt, labels.createRefund].map((label) => <th key={label} className="px-4 py-3 font-medium">{label}</th>)}
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
                <td className="px-4 py-3">
                  {purchase.remainingRecordedTokens === null ? (
                    <span className="text-xs text-ink-soft">{labels.allocationInconsistent}</span>
                  ) : (
                    <form onSubmit={(event) => createRefund(event, purchase.id)} className="min-w-56 space-y-2">
                      <div className="text-xs text-ink-soft">{labels.refundAmountInput}</div>
                      <div className="font-medium tabular-nums">
                        {money(calculateUnusedTokenRefundKurus({ packageTokens: purchase.packageTokens, packagePriceKurus: purchase.paidAmountKurus, unusedTokens: purchase.remainingRecordedTokens }), locale)}
                      </div>
                      <div className="text-xs text-ink-soft">{labels.tokensToReverseInput}: {purchase.remainingRecordedTokens}</div>
                      <button disabled={busy || purchase.remainingRecordedTokens <= 0 || calculateUnusedTokenRefundKurus({ packageTokens: purchase.packageTokens, packagePriceKurus: purchase.paidAmountKurus, unusedTokens: purchase.remainingRecordedTokens }) <= 0} className="rounded bg-navy px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">{labels.createRefund}</button>
                    </form>
                  )}
                </td>
              </tr>)}
              {purchases.length === 0 && <tr><td colSpan={9} className="px-4 py-10 text-center text-ink-soft">{labels.noPurchases}</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-ink-soft">{labels.purchaseFooter}</p>
      </section>
    </main>
  );
}
