"use server";

import { auth, signOut } from "@/features/auth/auth";
import { userRepository } from "./repository";

export type DeleteAccountError = "auth-required" | "admin-account" | "confirmation-mismatch" | "failed";

export interface DeleteAccountActionResult {
  ok: boolean;
  error?: DeleteAccountError;
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Deletes the signed-in user's own account (see
 * userRepository.deleteAccount for exactly what is deleted vs anonymized).
 * The account is always the session's — this action takes no user id at
 * all, so it can never target someone else's. The caller must retype the
 * account's email as the second confirmation step; it's checked here,
 * server-side, against the database row, never trusted from the client.
 *
 * Replay-safe: after a successful deletion the session no longer resolves
 * (the jwt callback's account check), so a repeated call is simply
 * `auth-required`; two concurrent calls serialize on the row lock and the
 * second finds nothing to delete. Server Actions carry Next.js's own
 * same-origin check, so this can't be triggered cross-site.
 */
export async function deleteOwnAccount(confirmationEmail: string): Promise<DeleteAccountActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "auth-required" };
  if (session.user.role === "admin") return { ok: false, error: "admin-account" };

  const user = await userRepository.getById(session.user.id);
  if (!user) return { ok: false, error: "auth-required" };
  if (typeof confirmationEmail !== "string" || normalizeEmail(confirmationEmail) !== normalizeEmail(user.email)) {
    return { ok: false, error: "confirmation-mismatch" };
  }

  let result: Awaited<ReturnType<typeof userRepository.deleteAccount>>;
  try {
    result = await userRepository.deleteAccount(user.id);
  } catch (error) {
    // The transaction rolled back — nothing was deleted. Log the error's
    // kind only: driver errors carry query parameters (personal data).
    console.error("[account-deletion] transaction failed", error instanceof Error ? error.name : "unknown");
    return { ok: false, error: "failed" };
  }
  if (result.status === "admin-account") return { ok: false, error: "admin-account" };
  if (result.status === "not-found") return { ok: false, error: "auth-required" };

  // Clear this browser's cookie now; every other copy of the session is
  // already dead via the jwt callback's account check.
  await signOut({ redirect: false });
  return { ok: true };
}
