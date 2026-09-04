"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/features/auth/auth";
import { messageRepository } from "./repository";
import type { Message } from "./types";

export type ModerationError = "unauthorized" | "not-found" | "already-moderated";

export interface ModerationResult {
  ok: boolean;
  error?: ModerationError;
  /** EPIC 014: the updated row (moderatedAt/moderatedBy/moderationReason included) so the client can update its local view without a full refetch. */
  message?: Message;
  /** EPIC 014: the acting admin's own display name/email, resolved server-side from the session — never client-supplied. */
  moderatorName?: string;
}

async function requireAdmin() {
  const session = await auth();
  if (session?.user?.role !== "admin") return null;
  return session.user;
}

const MAX_MODERATION_REASON_LENGTH = 1000;

/**
 * EPIC 014: trims and caps the admin-authored reason, collapsing
 * whitespace-only input to `null` — never persists a "reason" that's
 * actually just spaces, and never trusts client-side trimming alone.
 */
function normalizeReason(reason: string | undefined): string | null {
  return reason?.trim().slice(0, MAX_MODERATION_REASON_LENGTH) || null;
}

export async function approveMessage(id: string, reason?: string): Promise<ModerationResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "unauthorized" };

  const existing = await messageRepository.getById(id);
  if (!existing) return { ok: false, error: "not-found" };
  if (existing.status !== "pending") return { ok: false, error: "already-moderated" };

  const updated = await messageRepository.approve(id, admin.id, normalizeReason(reason));
  if (!updated) return { ok: false, error: "already-moderated" };

  revalidatePath("/admin/moderation");
  return { ok: true, message: updated, moderatorName: admin.name ?? admin.email ?? undefined };
}

export async function rejectMessage(id: string, reason?: string): Promise<ModerationResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "unauthorized" };

  const existing = await messageRepository.getById(id);
  if (!existing) return { ok: false, error: "not-found" };
  if (existing.status !== "pending") return { ok: false, error: "already-moderated" };

  const updated = await messageRepository.reject(id, admin.id, normalizeReason(reason));
  if (!updated) return { ok: false, error: "already-moderated" };

  revalidatePath("/admin/moderation");
  return { ok: true, message: updated, moderatorName: admin.name ?? admin.email ?? undefined };
}

/**
 * EPIC: Approved Message Management — pulls a live, already-approved
 * message off the public board without deleting it. `requireAdmin()` is
 * re-verified here regardless of anything the client claims (the actual
 * boundary is still the repository's conditional UPDATE — this is defense
 * in depth, same shape as approve/reject above).
 */
export async function archiveMessage(id: string, reason?: string): Promise<ModerationResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "unauthorized" };

  const existing = await messageRepository.getById(id);
  if (!existing) return { ok: false, error: "not-found" };
  if (existing.status !== "approved") return { ok: false, error: "already-moderated" };

  const updated = await messageRepository.archive(id, admin.id, normalizeReason(reason));
  if (!updated) return { ok: false, error: "already-moderated" };

  revalidatePath("/admin/moderation");
  revalidatePath("/board");
  return { ok: true, message: updated, moderatorName: admin.name ?? admin.email ?? undefined };
}

/**
 * The inverse of archiveMessage — never recomputes placement (see
 * repository.ts's restore()), so the message reappears at the exact same
 * board coordinate it had before archiving. Never creates a new row.
 */
export async function restoreMessage(id: string): Promise<ModerationResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "unauthorized" };

  const existing = await messageRepository.getById(id);
  if (!existing) return { ok: false, error: "not-found" };
  if (existing.status !== "archived") return { ok: false, error: "already-moderated" };

  const updated = await messageRepository.restore(id, admin.id);
  if (!updated) return { ok: false, error: "already-moderated" };

  revalidatePath("/admin/moderation");
  revalidatePath("/board");
  return { ok: true, message: updated, moderatorName: admin.name ?? admin.email ?? undefined };
}

/**
 * EPIC: Statüye Göre Yönetim Aksiyonları — a rejected message's "geri
 * incelemeye al" action: rejected → pending. It never appeared on the
 * board (rejection happens before approval ever places it), so there's
 * no revalidatePath("/board") here — only the moderation queue changes.
 */
export async function reconsiderMessage(id: string): Promise<ModerationResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "unauthorized" };

  const existing = await messageRepository.getById(id);
  if (!existing) return { ok: false, error: "not-found" };
  if (existing.status !== "rejected") return { ok: false, error: "already-moderated" };

  const updated = await messageRepository.reconsider(id, admin.id);
  if (!updated) return { ok: false, error: "already-moderated" };

  revalidatePath("/admin/moderation");
  return { ok: true, message: updated, moderatorName: admin.name ?? admin.email ?? undefined };
}
