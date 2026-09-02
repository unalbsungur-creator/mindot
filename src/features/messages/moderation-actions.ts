"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/features/auth/auth";
import { messageRepository } from "./repository";

export type ModerationError = "unauthorized" | "not-found" | "already-moderated";

export interface ModerationResult {
  ok: boolean;
  error?: ModerationError;
}

async function requireAdmin() {
  const session = await auth();
  if (session?.user?.role !== "admin") return null;
  return session.user;
}

export async function approveMessage(id: string): Promise<ModerationResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "unauthorized" };

  const existing = await messageRepository.getById(id);
  if (!existing) return { ok: false, error: "not-found" };
  if (existing.status !== "pending") return { ok: false, error: "already-moderated" };

  const updated = await messageRepository.approve(id, admin.id);
  if (!updated) return { ok: false, error: "already-moderated" };

  revalidatePath("/admin/moderation");
  return { ok: true };
}

export async function rejectMessage(id: string): Promise<ModerationResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "unauthorized" };

  const existing = await messageRepository.getById(id);
  if (!existing) return { ok: false, error: "not-found" };
  if (existing.status !== "pending") return { ok: false, error: "already-moderated" };

  const updated = await messageRepository.reject(id, admin.id);
  if (!updated) return { ok: false, error: "already-moderated" };

  revalidatePath("/admin/moderation");
  return { ok: true };
}

/**
 * EPIC: Approved Message Management — pulls a live, already-approved
 * message off the public board without deleting it. `requireAdmin()` is
 * re-verified here regardless of anything the client claims (the actual
 * boundary is still the repository's conditional UPDATE — this is defense
 * in depth, same shape as approve/reject above).
 */
export async function archiveMessage(id: string): Promise<ModerationResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "unauthorized" };

  const existing = await messageRepository.getById(id);
  if (!existing) return { ok: false, error: "not-found" };
  if (existing.status !== "approved") return { ok: false, error: "already-moderated" };

  const updated = await messageRepository.archive(id, admin.id);
  if (!updated) return { ok: false, error: "already-moderated" };

  revalidatePath("/admin/moderation");
  revalidatePath("/board");
  return { ok: true };
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
  return { ok: true };
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
  return { ok: true };
}
