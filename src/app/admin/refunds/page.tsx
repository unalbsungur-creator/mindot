import { desc, eq } from "drizzle-orm";
import { requireAdmin } from "@/features/auth/requireAdmin";
import { getDb } from "@/lib/db/client";
import { tokenPurchaseLots, tokenRefunds, users } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const statusLabels = {
  pending_external_refund: "Shopier iadesi bekleniyor",
  external_refund_confirmed: "Harici iade doğrulandı",
  cancelled: "İptal edildi",
} as const;

function money(kurus: number): string {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(kurus / 100);
}

function date(value: Date | null): string {
  return value ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Istanbul" }).format(value) : "—";
}

/**
 * Read-only review surface for the refund foundation.
 * Deliberately has no buttons/actions that create, cancel, or confirm refunds:
 * policy and the actual Shopier refund workflow are not approved/implemented yet.
 */
export default async function AdminRefundsPage() {
  const admin = await requireAdmin();
  if (!admin) {
    return <main className="mx-auto max-w-5xl px-4 py-10"><h1 className="text-2xl font-semibold">İade kayıtları</h1><p className="mt-3">Bu sayfayı görüntüleme yetkiniz yok.</p></main>;
  }

  const db = getDb();
  const purchaseRows = await db
    .select({
      id: tokenPurchaseLots.id,
      orderReference: tokenPurchaseLots.externalOrderReference,
      packageId: tokenPurchaseLots.packageId,
      packageTokens: tokenPurchaseLots.packageTokens,
      paidAmountKurus: tokenPurchaseLots.paidAmountKurus,
      paymentApprovedAt: tokenPurchaseLots.paymentApprovedAt,
      createdAt: tokenPurchaseLots.createdAt,
      userEmail: users.email,
    })
    .from(tokenPurchaseLots)
    .innerJoin(users, eq(tokenPurchaseLots.userId, users.id))
    .orderBy(desc(tokenPurchaseLots.createdAt))
    .limit(100);

  const rows = await db
    .select({
      id: tokenRefunds.id,
      status: tokenRefunds.status,
      amountKurus: tokenRefunds.refundAmountKurus,
      tokensReversed: tokenRefunds.tokensReversed,
      externalReference: tokenRefunds.externalRefundReference,
      createdAt: tokenRefunds.createdAt,
      confirmedAt: tokenRefunds.confirmedAt,
      orderReference: tokenPurchaseLots.externalOrderReference,
      packageId: tokenPurchaseLots.packageId,
      userEmail: users.email,
    })
    .from(tokenRefunds)
    .innerJoin(tokenPurchaseLots, eq(tokenRefunds.purchaseLotId, tokenPurchaseLots.id))
    .innerJoin(users, eq(tokenRefunds.userId, users.id))
    .orderBy(desc(tokenRefunds.createdAt))
    .limit(100);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold text-ink">İade kayıtları</h1>
      <p className="mt-2 max-w-3xl text-sm text-ink-soft">
        Bu ekran yalnızca mevcut kayıtları listeler. Henüz iade oluşturmaz, iptal etmez veya Shopier iadesini onaylamaz.
        Gerçek iade, Shopier tarafında tamamlanıp dış referansı doğrulanmadan tamamlandı sayılmaz.
      </p>
      <div className="mt-6 overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[900px] border-collapse text-left text-sm">
          <thead className="bg-canvas text-ink-soft">
            <tr>
              <th className="px-4 py-3 font-medium">Sipariş / kullanıcı</th>
              <th className="px-4 py-3 font-medium">Durum</th>
              <th className="px-4 py-3 font-medium">Kayıtlı tutar</th>
              <th className="px-4 py-3 font-medium">Token geri alma</th>
              <th className="px-4 py-3 font-medium">Shopier iade referansı</th>
              <th className="px-4 py-3 font-medium">Oluşturulma</th>
              <th className="px-4 py-3 font-medium">Doğrulanma</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.id} className="align-top">
                <td className="px-4 py-3">
                  <div className="font-medium text-ink">{row.orderReference}</div>
                  <div className="mt-1 text-xs text-ink-soft">{row.userEmail}</div>
                  <div className="mt-1 text-xs text-ink-soft">{row.packageId}</div>
                </td>
                <td className="px-4 py-3">{statusLabels[row.status]}</td>
                <td className="px-4 py-3 tabular-nums">{money(row.amountKurus)}</td>
                <td className="px-4 py-3 tabular-nums">{row.tokensReversed}</td>
                <td className="px-4 py-3 break-all">{row.externalReference ?? "—"}</td>
                <td className="px-4 py-3 whitespace-nowrap">{date(row.createdAt)}</td>
                <td className="px-4 py-3 whitespace-nowrap">{date(row.confirmedAt)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-ink-soft">Henüz iade kaydı yok.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-ink-soft">En son 100 kayıt gösterilir. Bu ekran herhangi bir finansal işlem yapmaz.</p>
      <section className="mt-10">
        <h2 className="text-xl font-semibold text-ink">Token satın alımları</h2>
        <p className="mt-2 max-w-3xl text-sm text-ink-soft">
          Bu liste iade değerlendirmesi için kaynak kayıtları gösterir; satın alımın iade edilebilir olduğu anlamına gelmez.
          Ödeme onay zamanı bilinmiyorsa ayrıca doğrulanmalıdır. Henüz iade tutarı veya geri alınacak Token miktarı önerilmez.
        </p>
        <div className="mt-4 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[780px] border-collapse text-left text-sm">
            <thead className="bg-canvas text-ink-soft">
              <tr>
                <th className="px-4 py-3 font-medium">Sipariş / kullanıcı</th>
                <th className="px-4 py-3 font-medium">Paket</th>
                <th className="px-4 py-3 font-medium">Token</th>
                <th className="px-4 py-3 font-medium">Ödenen tutar</th>
                <th className="px-4 py-3 font-medium">Ödeme onayı</th>
                <th className="px-4 py-3 font-medium">Kayıt tarihi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {purchaseRows.map((purchase) => (
                <tr key={purchase.id} className="align-top">
                  <td className="px-4 py-3">
                    <div className="font-medium text-ink">{purchase.orderReference}</div>
                    <div className="mt-1 text-xs text-ink-soft">{purchase.userEmail}</div>
                  </td>
                  <td className="px-4 py-3">{purchase.packageId}</td>
                  <td className="px-4 py-3 tabular-nums">{purchase.packageTokens}</td>
                  <td className="px-4 py-3 tabular-nums">{money(purchase.paidAmountKurus)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{date(purchase.paymentApprovedAt)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{date(purchase.createdAt)}</td>
                </tr>
              ))}
              {purchaseRows.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-ink-soft">Henüz Token satın alımı kaydı yok.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-ink-soft">En son 100 satın alım gösterilir. Bu liste salt okunurdur.</p>
      </section>
    </main>
  );
}
