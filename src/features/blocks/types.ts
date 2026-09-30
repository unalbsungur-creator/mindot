/** One entry of a viewer's own block list — as narrow as `PublicProfile`: no database id, no email. */
export interface BlockedUserSummary {
  publicId: string;
  displayName: string | null;
  image: string | null;
  blockedAt: string;
}
