import type { User } from "@/features/users/types";

/**
 * The version of the public-wall consent text (`profile.wallConsent*` in
 * the dictionaries). Same "orphan the old value" scheme as
 * CONTENT_CONSENT_VERSION: `setWallVisibility` only turns a wall on for
 * exactly this version, and a wall whose owner accepted an older one is
 * closed to visitors until they accept again — so bump this only when the
 * consent's meaning changes, knowing it closes every public wall at once.
 */
export const PUBLIC_WALL_CONSENT_VERSION = "1.0";

type WallConsentFields = Pick<User, "publicWallEnabled" | "publicWallConsentVersion">;

/**
 * The one rule for whether strangers may see a user's wall: turned on AND
 * consented to under the current text. `getPublicWall` applies it, so the
 * wall page, its metadata, the wall share image and its Open Graph image
 * all follow it; `/me` uses it to tell the owner their wall is waiting for
 * consent.
 */
export function isPublicWallEligible(user: WallConsentFields): boolean {
  return user.publicWallEnabled && user.publicWallConsentVersion === PUBLIC_WALL_CONSENT_VERSION;
}

/** What the owner's `/me` wall switch shows: public, off, or turned on but closed until they accept the current consent. */
export type WallVisibilityState = "public" | "off" | "consent-required";

export function wallVisibilityState(user: WallConsentFields): WallVisibilityState {
  if (isPublicWallEligible(user)) return "public";
  return user.publicWallEnabled ? "consent-required" : "off";
}
