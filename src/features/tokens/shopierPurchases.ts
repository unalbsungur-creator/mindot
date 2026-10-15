import { isTokenPackageId, type TokenPackageId } from "./config/tokenPackages";
import { cleanManualReviewReason, normalizeEmail, normalizeShopierOrderRef, type ShopierEmailCheck } from "./lib/shopierPurchase";
import { tokenRepository, type CreditShopierPurchaseResult, type ShopierOrderRecord } from "./repository";

/** What the admin dialog sends. Every field is client input and is checked here — none is trusted. */
export interface RecordShopierPurchaseInput {
  userId: string;
  /** One of TOKEN_PACKAGES' ids. The Token amount comes from the package, never from the client. */
  packageId: string;
  /** The Shopier order number — required. */
  orderRef: string;
  /** The order's buyer email, for comparison with the account's only — never stored. */
  buyerEmail: string;
  /** Ticked by the admin when the emails differ and the order was checked by hand. */
  manualReview?: boolean;
  /** Required with `manualReview`. */
  manualReviewReason?: string;
  note?: string;
}

export type RecordShopierPurchaseError =
  | "auth-required"
  | "forbidden"
  | "target-user-not-found"
  | "invalid-package"
  | "invalid-order"
  | "invalid-email"
  // `manualReview` ticked without a (non-blank) reason.
  | "manual-review-reason-required"
  // The emails differ and the admin didn't tick manual review with a reason.
  | "email-mismatch"
  // This order already credited another account or package — see `existingOrder`.
  | "order-already-used"
  | "conflict"
  | "failed";

export type RecordShopierPurchaseResult =
  | {
      ok: true;
      data: {
        /** `already_recorded`: a retry of this exact purchase — nothing credited a second time. */
        status: "credited" | "already_recorded";
        packageId: TokenPackageId;
        tokens: number;
        balance: number;
        ledgerEntryId: string;
        /** Only on `credited`: how the account was matched. */
        emailCheck?: ShopierEmailCheck;
      };
    }
  | { ok: false; error: Exclude<RecordShopierPurchaseError, "order-already-used"> }
  | { ok: false; error: "order-already-used"; existingOrder: ShopierOrderRecord };

export interface RecordShopierPurchaseDeps {
  /** The session's admin (server-side role check), or null. */
  requireAdmin: () => Promise<{ id: string } | null>;
  /** Whether any session exists at all — only to tell "auth-required" from "forbidden". */
  hasSession: () => Promise<boolean>;
  /** Active = exists and not a deleted account's tombstone. */
  isActiveAccount: (userId: string) => Promise<boolean>;
  credit: (input: Parameters<typeof tokenRepository.creditShopierPurchase>[0]) => Promise<CreditShopierPurchaseResult>;
  revalidate: () => void;
}

/**
 * Records a Shopier purchase an admin has checked by hand (Token Al V1).
 * The admin is the session's, re-verified here on every call (a Server
 * Function is callable without the admin UI). The client only names the
 * account, the package, the order and the buyer's email; the amount, the
 * idempotency key and the transaction belong to
 * `tokenRepository.creditShopierPurchase`, which this never re-implements.
 * Everything the client sent is validated before the database is touched,
 * and a refused request — no admin, bad input, a mismatch without a
 * reason — never reaches the wallet or the ledger.
 */
export async function recordShopierPurchaseForAdmin(
  input: RecordShopierPurchaseInput,
  deps: RecordShopierPurchaseDeps
): Promise<RecordShopierPurchaseResult> {
  const admin = await deps.requireAdmin();
  if (!admin) return { ok: false, error: (await deps.hasSession()) ? "forbidden" : "auth-required" };

  const value = (input ?? {}) as Partial<Record<keyof RecordShopierPurchaseInput, unknown>>;
  const userId = typeof value.userId === "string" ? value.userId : "";
  if (!userId) return { ok: false, error: "target-user-not-found" };
  if (!isTokenPackageId(value.packageId)) return { ok: false, error: "invalid-package" };
  const packageId = value.packageId;
  if (!normalizeShopierOrderRef(value.orderRef)) return { ok: false, error: "invalid-order" };
  if (!normalizeEmail(value.buyerEmail)) return { ok: false, error: "invalid-email" };

  // Manual review is an explicit choice plus a reason. Without the choice
  // no reason is passed on, so differing emails come back "email-mismatch".
  const manualReview = value.manualReview === true;
  const manualReviewReason = manualReview ? cleanManualReviewReason(value.manualReviewReason) : null;
  if (manualReview && !manualReviewReason) return { ok: false, error: "manual-review-reason-required" };

  // Not getById: a deleted account's tombstone row still exists and is never credited.
  if (!(await deps.isActiveAccount(userId))) return { ok: false, error: "target-user-not-found" };

  let result: CreditShopierPurchaseResult;
  try {
    result = await deps.credit({
      userId,
      adminId: admin.id,
      packageId,
      orderRef: value.orderRef as string,
      buyerEmail: value.buyerEmail as string,
      manualReviewReason,
      note: typeof value.note === "string" ? value.note : null,
    });
  } catch (error) {
    // The error's name only: a driver message could carry submitted values.
    console.error("[shopier-purchase] credit failed", error instanceof Error ? error.name : "unknown");
    return { ok: false, error: "failed" };
  }

  switch (result.status) {
    case "credited":
      deps.revalidate();
      return {
        ok: true,
        data: {
          status: "credited",
          packageId,
          tokens: result.entry.amount,
          balance: result.balance,
          ledgerEntryId: result.entry.id,
          emailCheck: result.emailCheck,
        },
      };
    case "already_recorded":
      return {
        ok: true,
        data: { status: "already_recorded", packageId, tokens: result.entry.amount, balance: result.balance, ledgerEntryId: result.entry.id },
      };
    case "order_already_used":
      return { ok: false, error: "order-already-used", existingOrder: result.existing };
    case "email_mismatch":
      return { ok: false, error: "email-mismatch" };
    case "invalid_package":
      return { ok: false, error: "invalid-package" };
    case "invalid_order":
      return { ok: false, error: "invalid-order" };
    case "invalid_email":
      return { ok: false, error: "invalid-email" };
    case "ineligible":
      return { ok: false, error: "target-user-not-found" };
    case "conflict":
      return { ok: false, error: "conflict" };
  }
}

export const defaultCreditShopierPurchase: RecordShopierPurchaseDeps["credit"] = (input) => tokenRepository.creditShopierPurchase(input);
