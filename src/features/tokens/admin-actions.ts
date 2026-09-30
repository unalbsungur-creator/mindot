"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/features/auth/auth";
import { requireAdmin } from "@/features/auth/requireAdmin";
import { userRepository } from "@/features/users/repository";
import { adminGrantIdempotencyKey, tokenRepository } from "./repository";
import { MAX_ADMIN_GRANT_AMOUNT } from "./types";

const MAX_NOTE_LENGTH = 500;
const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type GrantTokensError =
  | "auth-required"
  | "forbidden"
  | "invalid-amount"
  | "invalid-request"
  | "target-user-not-found"
  | "conflict";

export interface GrantTokensResult {
  ok: boolean;
  error?: GrantTokensError;
  data?: {
    /** `already_granted` means this was a retry of an earlier grant and credited nothing new. */
    status: "granted" | "already_granted";
    balance: number;
    ledgerEntryId: string;
  };
}

/**
 * Credits Tokens to a user from /admin/users. The admin is always the
 * session's (re-verified here, never trusted from the page gate), and the
 * ledger's amount, balance_after and created_by are all server-derived —
 * the client only names the target, the amount, an optional note, and a
 * per-dialog `requestId` that makes a retried submit of the same grant
 * idempotent (see `adminGrantIdempotencyKey`). Granting to oneself is
 * allowed: an admin is still an ordinary Token holder.
 */
export async function grantTokens(input: {
  userId: string;
  amount: number;
  note?: string;
  requestId: string;
}): Promise<GrantTokensResult> {
  const admin = await requireAdmin();
  if (!admin) {
    const session = await auth();
    return { ok: false, error: session?.user?.id ? "forbidden" : "auth-required" };
  }

  const { userId, amount, note, requestId } = input;
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount <= 0 || amount > MAX_ADMIN_GRANT_AMOUNT) {
    return { ok: false, error: "invalid-amount" };
  }
  if (typeof requestId !== "string" || !REQUEST_ID_PATTERN.test(requestId)) {
    return { ok: false, error: "invalid-request" };
  }
  if (typeof userId !== "string" || !userId) return { ok: false, error: "target-user-not-found" };

  const target = await userRepository.getById(userId);
  if (!target) return { ok: false, error: "target-user-not-found" };

  const result = await tokenRepository.grantByAdmin({
    userId: target.id,
    amount,
    adminId: admin.id,
    idempotencyKey: adminGrantIdempotencyKey(admin.id, requestId.toLowerCase()),
    note: (typeof note === "string" ? note.trim().slice(0, MAX_NOTE_LENGTH) : "") || null,
  });
  if (result.status === "conflict") return { ok: false, error: "conflict" };

  revalidatePath("/admin/users");
  return { ok: true, data: { status: result.status, balance: result.balance, ledgerEntryId: result.entry.id } };
}
