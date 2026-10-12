/**
 * What the Facebook/Instagram/TikTok buttons on /share/[messageId] do —
 * decided here, as plain functions, so SocialShareActions only carries it
 * out. None of these routes is itself a completed share: only the OS share
 * sheet's own "shared" result counts for the first-share reward
 * (`isCompletedShare`), never opening Facebook's dialog or a download.
 */
export type SocialPlatform = "facebook" | "instagram" | "tiktok";

export type SocialShareRoute =
  /** Phones/tablets: the real image into the OS share sheet (the visitor picks the app). */
  | "native-sheet"
  /** Facebook's web share dialog for the page URL — works without any app installed. */
  | "facebook-dialog"
  /** Download the image; the visitor uploads it themselves in the app or on the website. */
  | "download";

/** Popup features for Facebook's dialog: no opener, no referrer. */
export const FACEBOOK_DIALOG_FEATURES = "noopener,noreferrer,width=600,height=520";

/** Facebook's web share dialog (no app ID needed); it reads the page's own Open Graph tags. */
export function facebookShareUrl(pageUrl: string): string {
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}`;
}

/**
 * Whether the primary input is touch (phones, tablets): no hover and a
 * coarse pointer. Desktop browsers can support file sharing too (Chrome and
 * Edge on Windows, Safari on macOS), but their share sheet rarely offers
 * Facebook, Instagram or TikTok — so the platform buttons use the share
 * sheet only here. A laptop with a touchscreen still reports a fine primary
 * pointer and keeps the desktop routes. False without matchMedia (server).
 */
export function isTouchPrimaryDevice(matchMedia: ((query: string) => { matches: boolean }) | undefined = globalThis.matchMedia): boolean {
  if (typeof matchMedia !== "function") return false;
  try {
    return matchMedia("(hover: none) and (pointer: coarse)").matches;
  } catch {
    return false;
  }
}

/**
 * The route for one platform button. `nativeSheet` is true only when the
 * browser can share a file AND the device is touch-primary; otherwise (and
 * as the fallback when the sheet turns out unsupported at click time)
 * Facebook opens its web dialog and Instagram/TikTok download the image —
 * no app is assumed to be installed and none is opened automatically.
 */
export function socialShareRoute(platform: SocialPlatform, { nativeSheet }: { nativeSheet: boolean }): SocialShareRoute {
  if (nativeSheet) return "native-sheet";
  return platform === "facebook" ? "facebook-dialog" : "download";
}
