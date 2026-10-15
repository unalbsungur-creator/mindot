import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { requireAdmin } from "@/features/auth/requireAdmin";
import { getDb } from "@/lib/db/client";
import { tokenPurchaseAllocations, tokenPurchaseLots, tokenRefunds, users } from "@/lib/db/schema";
import { AdminRefundsContent } from "./AdminRefundsContent";

export const dynamic = "force-dynamic";

export default async function AdminRefundsPage() {
  const admin = await requireAdmin();
  if (!admin) {
    return <AdminRefundsContent authorized={false} refunds={[]} purchases={[]} />;
  }

  const db = getDb();
  const [refundRows, purchaseRows, allocationRows, reservedRefundRows] = await Promise.all([
    db
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
      .limit(100),
    db
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
      .limit(100),
    db
      .select({
        purchaseLotId: tokenPurchaseAllocations.purchaseLotId,
        allocatedTokens: sql<number>`coalesce(sum(${tokenPurchaseAllocations.amount}), 0)::int`,
      })
      .from(tokenPurchaseAllocations)
      .groupBy(tokenPurchaseAllocations.purchaseLotId),
    db
      .select({
        purchaseLotId: tokenRefunds.purchaseLotId,
        reservedTokens: sql<number>`coalesce(sum(${tokenRefunds.tokensReversed}), 0)::int`,
      })
      .from(tokenRefunds)
      .where(inArray(tokenRefunds.status, ["pending_external_refund", "external_refund_confirmed"]))
      .groupBy(tokenRefunds.purchaseLotId),
  ]);
  const allocatedByLot = new Map(
    allocationRows
      .filter((row) => row.purchaseLotId !== null)
      .map((row) => [row.purchaseLotId as string, row.allocatedTokens] as const)
  );
  const reservedByLot = new Map(reservedRefundRows.map((row) => [row.purchaseLotId, row.reservedTokens] as const));

  return (
    <AdminRefundsContent
      authorized
      refunds={refundRows.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
        confirmedAt: row.confirmedAt?.toISOString() ?? null,
      }))}
      purchases={purchaseRows.map((row) => ({
        ...row,
        allocatedTokens: allocatedByLot.get(row.id) ?? 0,
        remainingRecordedTokens:
          row.packageTokens >= (allocatedByLot.get(row.id) ?? 0) + (reservedByLot.get(row.id) ?? 0)
            ? row.packageTokens - (allocatedByLot.get(row.id) ?? 0) - (reservedByLot.get(row.id) ?? 0)
            : null,
        paymentApprovedAt: row.paymentApprovedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      }))}
    />
  );
}
