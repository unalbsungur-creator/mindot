export type UserRole = "user" | "admin";
/** EPIC 013: submission eligibility — independent of `UserRole`. See schema.ts's `userAccountStatusEnum` doc comment. */
export type UserAccountStatus = "active" | "suspended";

export interface User {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  role: UserRole;
  /** The opaque /u/[publicId] identifier — null only for a row that predates EPIC 009 and hasn't been backfilled yet; see ensurePublicId(). */
  publicId: string | null;
  /** EPIC 011: whether strangers can view this user's personal wall at /u/[publicId]. Defaults false — privacy-first, opt-in. */
  publicWallEnabled: boolean;
  /** EPIC 011: optional short line shown on the public wall header, only when publicWallEnabled. */
  publicWallDescription: string | null;
  /** EPIC 013: "active" unless an admin has suspended this account — see submitMessage's server-side re-check. */
  status: UserAccountStatus;
  /** The most recent suspend action's reason, admin-authored. Cleared to null on unsuspend. Null for an always-active account. */
  statusReason: string | null;
  /** When `status` last changed (suspend or unsuspend), server-side timestamp. Null until the first status change ever happens. */
  statusChangedAt: string | null;
  /** Which admin made the most recent status change. Null until the first status change ever happens. */
  statusChangedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GoogleProfile {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
}
