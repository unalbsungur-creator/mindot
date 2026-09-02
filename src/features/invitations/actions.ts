"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/features/auth/auth";
import { getEmailService } from "@/features/email/service";
import { getAppUrl } from "@/lib/env";
import { inviteEmailContent } from "./emailTemplate";
import { invitationRepository } from "./repository";
import type { Invitation } from "./types";

export type InvitationActionError = "unauthorized" | "invalid-input" | "not-found";

export interface CreateInvitationInput {
  recipientEmail: string;
  maxUses: number;
  /** Days from now, or null for no expiry. */
  expiresInDays: number | null;
}

export interface InvitationActionResult {
  ok: boolean;
  error?: InvitationActionError;
  invitation?: Invitation;
}

async function requireAdmin() {
  const session = await auth();
  if (session?.user?.role !== "admin") return null;
  return session.user;
}

export async function createInvitation(input: CreateInvitationInput): Promise<InvitationActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "unauthorized" };
  if (!Number.isInteger(input.maxUses) || input.maxUses < 1) {
    return { ok: false, error: "invalid-input" };
  }

  const expiresAt =
    input.expiresInDays !== null ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000) : null;
  const recipientEmail = input.recipientEmail.trim() || null;

  let invitation = await invitationRepository.create({
    recipientEmail,
    maxUses: input.maxUses,
    expiresAt,
    createdBy: admin.id,
  });

  // EPIC: E-mail Gönderimi İçin Güvenli Mimari — deliberately decoupled
  // from invitation creation above: the invitation row already exists and
  // its link already works regardless of what happens here. A failed or
  // unconfigured email send only updates emailStatus for the admin's own
  // visibility (see InvitationsPageContent) — it never removes or
  // invalidates the invitation itself.
  if (recipientEmail) {
    const inviteUrl = new URL(`/invite/${invitation.token}`, getAppUrl()).toString();
    const { subject, html, text } = inviteEmailContent(inviteUrl);
    const result = await getEmailService().send({ to: recipientEmail, subject, html, text });
    const emailStatus = result.ok ? "sent" : result.reason === "not-configured" ? "not_configured" : "failed";
    const updated = await invitationRepository.updateEmailStatus(invitation.id, emailStatus);
    if (updated) invitation = updated;
  }

  revalidatePath("/admin/invitations");
  return { ok: true, invitation };
}

export async function revokeInvitation(id: string): Promise<InvitationActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "unauthorized" };

  const invitation = await invitationRepository.revoke(id);
  if (!invitation) return { ok: false, error: "not-found" };

  revalidatePath("/admin/invitations");
  return { ok: true, invitation };
}
