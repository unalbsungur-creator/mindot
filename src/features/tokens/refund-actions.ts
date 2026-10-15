"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { requireAdmin } from "@/features/auth/requireAdmin";
import { getDb } from "@/lib/db/client";
import {
  tokenLedger,
  tokenPurchaseAllocations,
  tokenPurchaseLots,
  tokenRefunds,
  tokenWallets,
} from "@/lib/db/schema";

type RefundActionResult = { ok: true } | { ok: false; error: string };
const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_REFERENCE_LENGTH = 200;

/**
 * Admin-entered amount and Token count are intentionally not auto-calculated:
 * no refund formula/policy has been approved. This action reserves the Tokens
 * immediately so they cannot be spent while the external Shopier refund is
 * being performed. The admin must then confirm the actual Shopier reference.
 */
export async function createTokenRefund(input: {
  purchaseLotId: string;
  refundAmountKurus: number;
  tokensReversed: number;
  requestId: string;
}): Promise<RefundActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "unauthorized" };
  if (
    typeof input.purchaseLotId !== "string" || !input.purchaseLotId ||
    !Number.isSafeInteger(input.refundAmountKurus) || input.refundAmountKurus < 0 ||
    !Number.isSafeInteger(input.tokensReversed) || input.tokensReversed <= 0 ||
    typeof input.requestId !== "string" || !REQUEST_ID.test(input.requestId)
  ) return { ok: false, error: "invalid_input" };

  const db = getDb();
  try {
    await db.transaction(async (tx) => {
      const [lot] = await tx.select().from(tokenPurchaseLots)
        .where(eq(tokenPurchaseLots.id, input.purchaseLotId)).for("update");
      if (!lot) throw new Error("purchase_not_found");

      const [wallet] = await tx.select().from(tokenWallets)
        .where(eq(tokenWallets.userId, lot.userId)).for("update");
      if (!wallet || wallet.balance < input.tokensReversed) throw new Error("insufficient_balance");

      const allocations = await tx.select({
        allocated: sql<number>`coalesce(sum(${tokenPurchaseAllocations.amount}), 0)::int`,
      }).from(tokenPurchaseAllocations)
        .where(eq(tokenPurchaseAllocations.purchaseLotId, lot.id));
      const refunds = await tx.select({
        tokens: sql<number>`coalesce(sum(${tokenRefunds.tokensReversed}), 0)::int`,
      }).from(tokenRefunds)
        .where(and(eq(tokenRefunds.purchaseLotId, lot.id), inArray(tokenRefunds.status, ["pending_external_refund", "external_refund_confirmed"])));
      const alreadyReserved = refunds[0]?.tokens ?? 0;
      const unused = lot.packageTokens - (allocations[0]?.allocated ?? 0) - alreadyReserved;
      if (input.tokensReversed > unused) throw new Error("tokens_exceed_unused");

      const id = crypto.randomUUID();
      const idempotencyKey = `token_refund_reserve:${input.requestId.toLowerCase()}`;
      const [existing] = await tx.select({ id: tokenRefunds.id }).from(tokenRefunds)
        .where(eq(tokenRefunds.idempotencyKey, idempotencyKey)).limit(1);
      if (existing) return;

      const [debited] = await tx.update(tokenWallets)
        .set({ balance: sql`${tokenWallets.balance} - ${input.tokensReversed}`, updatedAt: new Date() })
        .where(and(eq(tokenWallets.userId, lot.userId), sql`${tokenWallets.balance} >= ${input.tokensReversed}`))
        .returning({ balance: tokenWallets.balance });
      if (!debited) throw new Error("insufficient_balance");

      await tx.insert(tokenLedger).values({
        id: crypto.randomUUID(), userId: lot.userId, amount: -input.tokensReversed,
        type: "refund", balanceAfter: debited.balance, referenceType: "token_refund",
        referenceId: id, idempotencyKey: `${idempotencyKey}:reserve`, createdBy: admin.id,
        note: "Tokens reserved pending external Shopier refund",
      });
      await tx.insert(tokenRefunds).values({
        id, userId: lot.userId, purchaseLotId: lot.id, status: "pending_external_refund",
        refundAmountKurus: input.refundAmountKurus, tokensReversed: input.tokensReversed,
        idempotencyKey, createdBy: admin.id,
      });
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "";
    const allowed = ["purchase_not_found", "insufficient_balance", "tokens_exceed_unused"];
    return { ok: false, error: allowed.includes(reason) ? reason : "conflict" };
  }
  revalidatePath("/admin/refunds");
  revalidatePath("/admin/tokens");
  return { ok: true };
}

/** Mark confirmed only after Shopier itself has completed the refund. */
export async function confirmTokenRefund(input: {
  refundId: string;
  externalRefundReference: string;
}): Promise<RefundActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "unauthorized" };
  const reference = typeof input.externalRefundReference === "string" ? input.externalRefundReference.trim() : "";
  if (!input.refundId || !reference || reference.length > MAX_REFERENCE_LENGTH) {
    return { ok: false, error: "invalid_input" };
  }
  const db = getDb();
  try {
    await db.transaction(async (tx) => {
      const [refund] = await tx.select().from(tokenRefunds)
        .where(eq(tokenRefunds.id, input.refundId)).for("update");
      if (!refund) throw new Error("refund_not_found");
      if (refund.status === "external_refund_confirmed") {
        if (refund.externalRefundReference === reference) return;
        throw new Error("reference_conflict");
      }
      if (refund.status !== "pending_external_refund") throw new Error("terminal_state");
      await tx.update(tokenRefunds).set({
        status: "external_refund_confirmed",
        externalRefundReference: reference,
        confirmedAt: new Date(),
      }).where(eq(tokenRefunds.id, refund.id));
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "";
    const allowed = ["refund_not_found", "reference_conflict", "terminal_state"];
    return { ok: false, error: allowed.includes(reason) ? reason : "conflict" };
  }
  revalidatePath("/admin/refunds");
  return { ok: true };
}

/** Cancelling a pending external refund releases its reserved Tokens. */
export async function cancelTokenRefund(input: { refundId: string }): Promise<RefundActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "unauthorized" };
  if (!input.refundId) return { ok: false, error: "invalid_input" };
  const db = getDb();
  try {
    await db.transaction(async (tx) => {
      const [refund] = await tx.select().from(tokenRefunds)
        .where(eq(tokenRefunds.id, input.refundId)).for("update");
      if (!refund) throw new Error("refund_not_found");
      if (refund.status === "cancelled") return;
      if (refund.status !== "pending_external_refund") throw new Error("terminal_state");

      const [wallet] = await tx.select().from(tokenWallets)
        .where(eq(tokenWallets.userId, refund.userId)).for("update");
      if (!wallet) throw new Error("wallet_not_found");
      const [credited] = await tx.update(tokenWallets)
        .set({ balance: sql`${tokenWallets.balance} + ${refund.tokensReversed}`, updatedAt: new Date() })
        .where(eq(tokenWallets.userId, refund.userId))
        .returning({ balance: tokenWallets.balance });
      await tx.insert(tokenLedger).values({
        id: crypto.randomUUID(), userId: refund.userId, amount: refund.tokensReversed,
        type: "refund", balanceAfter: credited.balance, referenceType: "token_refund_cancel",
        referenceId: refund.id, idempotencyKey: `token_refund_cancel:${refund.id}`,
        createdBy: admin.id, note: "Reserved Tokens restored after refund cancellation",
      });
      await tx.update(tokenRefunds).set({ status: "cancelled" }).where(eq(tokenRefunds.id, refund.id));
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "";
    const allowed = ["refund_not_found", "terminal_state", "wallet_not_found"];
    return { ok: false, error: allowed.includes(reason) ? reason : "conflict" };
  }
  revalidatePath("/admin/refunds");
  revalidatePath("/admin/tokens");
  return { ok: true };
}
