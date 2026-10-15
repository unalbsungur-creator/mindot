/**
 * The admin "Record Shopier purchase" form's own logic (Token Al V1), kept
 * free of React so it can be tested against every dictionary: a quick
 * client-side check, the exact payload sent to `recordShopierPurchase`, and
 * one message per action result. The server action stays the boundary —
 * this only spares the admin a round trip for an obviously incomplete form.
 * Client-safe: no runtime variables, no repository (type-only imports).
 */
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/translations";
import type { RecordShopierPurchaseError, RecordShopierPurchaseInput, RecordShopierPurchaseResult } from "../shopierPurchases";
import { cleanManualReviewReason, normalizeEmail, normalizeShopierOrderRef } from "./shopierPurchase";

/** A package as the server page hands it to the client: display data only, no purchase link. */
export interface TokenPackageOption {
  id: string;
  tokens: number;
  priceTry: number;
}

export interface ShopierPurchaseFormValues {
  packageId: string;
  orderRef: string;
  buyerEmail: string;
  manualReview: boolean;
  manualReviewReason: string;
  note: string;
}

export const EMPTY_SHOPIER_PURCHASE_FORM: ShopierPurchaseFormValues = Object.freeze({
  packageId: "",
  orderRef: "",
  buyerEmail: "",
  manualReview: false,
  manualReviewReason: "",
  note: "",
});

export type ShopierPurchaseFormError = Extract<
  RecordShopierPurchaseError,
  "invalid-package" | "invalid-order" | "invalid-email" | "manual-review-reason-required"
>;

/** The first problem a submit would hit, or null — the same rules the action applies, for instant feedback. */
export function validateShopierPurchaseForm(values: ShopierPurchaseFormValues, packageIds: readonly string[]): ShopierPurchaseFormError | null {
  if (!packageIds.includes(values.packageId)) return "invalid-package";
  if (!normalizeShopierOrderRef(values.orderRef)) return "invalid-order";
  if (!normalizeEmail(values.buyerEmail)) return "invalid-email";
  if (values.manualReview && !cleanManualReviewReason(values.manualReviewReason)) return "manual-review-reason-required";
  return null;
}

/**
 * Exactly what the action needs — never an amount, a price or an admin id.
 * The reason travels only with an explicit manual review; an empty note
 * isn't sent.
 */
export function buildShopierPurchasePayload(userId: string, values: ShopierPurchaseFormValues): RecordShopierPurchaseInput {
  return {
    userId,
    packageId: values.packageId,
    orderRef: values.orderRef,
    buyerEmail: values.buyerEmail,
    ...(values.manualReview ? { manualReview: true, manualReviewReason: values.manualReviewReason } : {}),
    ...(values.note.trim() ? { note: values.note } : {}),
  };
}

/** Whole lira in the interface language, e.g. "₺12" / "12 ₺". Display only — payment happens on Shopier. */
export function formatTryPrice(priceTry: number, locale: Locale): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "TRY", maximumFractionDigits: 0, minimumFractionDigits: 0 }).format(priceTry);
}

export function packageOptionLabel(t: Dictionary["usersAdmin"], pkg: TokenPackageOption, locale: Locale): string {
  return t.recordPurchasePackageOption.replace("{tokens}", String(pkg.tokens)).replace("{price}", formatTryPrice(pkg.priceTry, locale));
}

export type ShopierPurchaseOutcome =
  | { kind: "success"; message: string; balance: number }
  | { kind: "error"; message: string };

/**
 * One message per result. `userLabelFor` names a user the page already
 * lists (null for one it doesn't — a deleted account's tombstone, shown as
 * `deletedAccountLabel`); nothing else about another account is shown. No
 * message ever repeats the buyer email.
 */
export function shopierPurchaseOutcome(
  result: RecordShopierPurchaseResult,
  ctx: {
    t: Dictionary["usersAdmin"];
    deletedAccountLabel: string;
    locale: Locale;
    userLabelFor: (userId: string) => string | null;
  }
): ShopierPurchaseOutcome {
  const { t } = ctx;
  if (result.ok) {
    const { status, tokens, balance, emailCheck } = result.data;
    const template =
      status === "already_recorded"
        ? t.recordPurchaseAlreadyRecorded
        : emailCheck === "manual_review"
          ? t.recordPurchaseSuccessManual
          : t.recordPurchaseSuccess;
    return { kind: "success", message: template.replace("{tokens}", String(tokens)).replace("{balance}", String(balance)), balance };
  }
  switch (result.error) {
    case "order-already-used": {
      const existing = result.existingOrder;
      const date = new Intl.DateTimeFormat(ctx.locale, { dateStyle: "medium" }).format(new Date(existing.createdAt));
      const user = ctx.userLabelFor(existing.userId) ?? ctx.deletedAccountLabel;
      return {
        kind: "error",
        message: t.recordPurchaseErrorOrderUsed.replace("{date}", date).replace("{user}", user).replace("{tokens}", String(existing.amount)),
      };
    }
    case "email-mismatch":
      return { kind: "error", message: t.recordPurchaseErrorEmailMismatch };
    case "manual-review-reason-required":
      return { kind: "error", message: t.recordPurchaseErrorReasonRequired };
    case "invalid-package":
      return { kind: "error", message: t.recordPurchaseErrorInvalidPackage };
    case "invalid-order":
      return { kind: "error", message: t.recordPurchaseErrorInvalidOrder };
    case "invalid-email":
      return { kind: "error", message: t.recordPurchaseErrorInvalidEmail };
    case "target-user-not-found":
      return { kind: "error", message: t.recordPurchaseErrorTargetNotFound };
    case "conflict":
      return { kind: "error", message: t.recordPurchaseErrorConflict };
    case "auth-required":
    case "forbidden":
      return { kind: "error", message: t.recordPurchaseErrorUnauthorized };
    case "failed":
      return { kind: "error", message: t.recordPurchaseErrorFailed };
  }
}

/** The message for a form the client check already refused (no request was sent). */
export function shopierPurchaseFormErrorMessage(t: Dictionary["usersAdmin"], error: ShopierPurchaseFormError): string {
  switch (error) {
    case "invalid-package":
      return t.recordPurchaseErrorInvalidPackage;
    case "invalid-order":
      return t.recordPurchaseErrorInvalidOrder;
    case "invalid-email":
      return t.recordPurchaseErrorInvalidEmail;
    case "manual-review-reason-required":
      return t.recordPurchaseErrorReasonRequired;
  }
}
