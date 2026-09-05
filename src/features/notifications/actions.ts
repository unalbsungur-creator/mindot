"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/features/auth/auth";
import { notificationRepository } from "./repository";

export type NotificationActionError = "auth-required" | "not-found";

export interface NotificationActionResult {
  ok: boolean;
  error?: NotificationActionError;
}

/**
 * The recipient is always `session.user.id` — never a client-supplied
 * userId — and `notificationRepository.markAsRead` re-verifies ownership
 * again itself via its own `WHERE recipient_user_id = ?` (the actual
 * boundary, not just this check). A `null` result means the notification
 * either doesn't exist or belongs to someone else; both collapse into the
 * same generic "not-found" error so this can never be used to probe
 * another user's notification ids.
 */
export async function markNotificationAsRead(id: string): Promise<NotificationActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "auth-required" };

  const updated = await notificationRepository.markAsRead(id, session.user.id);
  if (!updated) return { ok: false, error: "not-found" };

  revalidatePath("/notifications");
  return { ok: true };
}

export async function markAllNotificationsAsRead(): Promise<NotificationActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "auth-required" };

  await notificationRepository.markAllAsRead(session.user.id);

  revalidatePath("/notifications");
  return { ok: true };
}
