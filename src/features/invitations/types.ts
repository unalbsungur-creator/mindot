export type StoredInvitationStatus = "active" | "used" | "revoked";
export type InvitationStatus = StoredInvitationStatus | "expired";

/**
 * EPIC: E-mail Daveti — independent of `InvitationStatus` above (a link
 * can be perfectly active/usable while its email delivery failed or was
 * never configured). "not_requested" covers both "no recipientEmail was
 * given" and rows created before this feature existed.
 */
export type InvitationEmailStatus = "not_requested" | "sent" | "failed" | "not_configured";

export interface Invitation {
  id: string;
  token: string;
  status: StoredInvitationStatus;
  recipientEmail: string | null;
  emailStatus: InvitationEmailStatus;
  maxUses: number;
  usedCount: number;
  createdBy: string | null;
  createdAt: string;
  expiresAt: string | null;
  usedAt: string | null;
  revokedAt: string | null;
}

/**
 * The stored `status` field only ever moves to "used" or "revoked" — it
 * never flips to "expired" on its own, since nothing runs on a timer to do
 * that. This computes the status that actually applies right now, so an
 * invitation past its `expiresAt` reads as expired even if nothing ever
 * wrote that back to storage. Unchanged from EPIC 002 — the invitation
 * page depends on this exact contract.
 */
export function getEffectiveStatus(invitation: Invitation, now: Date = new Date()): InvitationStatus {
  if (invitation.status === "revoked") return "revoked";
  if (invitation.expiresAt && now.getTime() > new Date(invitation.expiresAt).getTime()) {
    return "expired";
  }
  if (invitation.usedCount >= invitation.maxUses) return "used";
  return "active";
}
