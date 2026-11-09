"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/features/auth/requireAdmin";
import { getEmailService } from "@/features/email/service";
import { SUPPORT_REPLY_TO } from "@/features/email/addresses";
import { defaultLocale, locales } from "@/i18n/config";
import { getAppUrl } from "@/lib/env";
import { inviteEmailContent } from "./emailTemplate";
import { invitationRepository } from "./repository";
import type { Invitation } from "./types";

export type InvitationActionError = "unauthorized" | "invalid-input" | "not-found" | "recently-invited";

/** MN-01: one invitation email per recipient per this many hours. */
export const INVITE_EMAIL_INTERVAL_HOURS = 24;

export interface CreateInvitationInput {
  recipientEmail: string;
  maxUses: number;
  /** Days from now, or null for no expiry. */
  expiresInDays: number | null;
  /** MN-01: the recipient's language for the email (one of the app's locales); defaults to the default locale. */
  language?: string;
}

export interface InvitationActionResult {
  ok: boolean;
  error?: InvitationActionError;
  invitation?: Invitation;
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
  const language = input.language && (locales as readonly string[]).includes(input.language) ? input.language : defaultLocale;
  // MN-01: at most one invitation email per recipient per 24 hours — checked before anything is created.
  if (recipientEmail && (await invitationRepository.hasRecentSentEmail(recipientEmail, INVITE_EMAIL_INTERVAL_HOURS))) {
    return { ok: false, error: "recently-invited" };
  }

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
    // The inviter is the signed-in admin; only their display name is shown (never an address — see emailTemplate.ts).
    const { subject, html, text } = inviteEmailContent({ inviteUrl, inviterName: admin.name ?? null, locale: language, siteUrl: getAppUrl().origin });
    // Replies go to the support mailbox, not the send-only EMAIL_FROM address.
    const result = await getEmailService().send({ to: recipientEmail, subject, html, text, replyTo: SUPPORT_REPLY_TO });
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
