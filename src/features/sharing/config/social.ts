/**
 * MINDOT's own social accounts. Centralized exactly like
 * features/memories/config/dilekkutum.ts and shoppier.ts: never hardcode a
 * social URL into a component. `null` by default for every platform — no
 * real MINDOT account exists yet on any of them — so UI that reads these
 * must render nothing rather than a broken/placeholder link. Set the
 * matching env var once a real account exists. `NEXT_PUBLIC_` because
 * these are read from a client component (the footer).
 */
export const SOCIAL_LINKS = {
  instagram: process.env.NEXT_PUBLIC_SOCIAL_INSTAGRAM_URL || null,
  tiktok: process.env.NEXT_PUBLIC_SOCIAL_TIKTOK_URL || null,
  youtube: process.env.NEXT_PUBLIC_SOCIAL_YOUTUBE_URL || null,
} as const;

export type SocialPlatform = keyof typeof SOCIAL_LINKS;
