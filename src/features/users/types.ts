export type UserRole = "user" | "admin";

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
  createdAt: string;
  updatedAt: string;
}

export interface GoogleProfile {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
}
