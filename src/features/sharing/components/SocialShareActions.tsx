"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "@/i18n/LocaleProvider";
import { cn } from "@/lib/cn";
import {
  downloadFile,
  fetchImageAsFile,
  hasUserActivation,
  isCompletedShare,
  offersDownloadAfterShare,
  shareFile,
  supportsFileShare,
} from "../lib/nativeFileShare";
import {
  FACEBOOK_DIALOG_FEATURES,
  facebookShareUrl,
  isTouchPrimaryDevice,
  socialShareRoute,
  type SocialPlatform,
} from "../lib/socialShare";

interface SocialShareActionsProps {
  /** The absolute, real page URL for this thought — what Facebook's share dialog actually reads Open Graph tags from. */
  pageUrl: string;
  /** The generated PNG's endpoint — the same real file every button hands off, one way or another. Must reflect whatever format the caller currently has selected (see `formatId`) — never a hardcoded one. */
  imageUrl: () => string;
  fileNamePrefix: string;
  /** EPIC 017: the format `imageUrl()` currently resolves to — used only to name the shared/downloaded file distinctly (e.g. `mindot-note-story.png`), matching `ShareCardPicker`'s own filename shape so a visitor sharing both formats never gets two files silently sharing one name. */
  formatId: string;
  /** Called only after the OS share sheet completed ("shared") — never for a platform fallback (Facebook dialog, download), cancel or failure. */
  onShared?: () => void;
}

/**
 * EPIC 016: real, honest platform hand-off — never a fake "posted for you"
 * action. Which route each button takes is decided in `lib/socialShare.ts`:
 *
 * - Phones/tablets that can share a file (`supportsFileShare()` plus a
 *   touch-primary device, `isTouchPrimaryDevice()`): all three buttons hand
 *   the real generated PNG to `navigator.share()`. Which app the visitor
 *   picks from that sheet is the OS's decision — no web API targets one
 *   specific app — hence the persistent hint below the row.
 * - Everywhere else, desktop browsers with file sharing included (their
 *   share sheet rarely offers these apps), and as the fallback when the
 *   sheet turns out unsupported at click time:
 *   - Facebook: `sharer.php?u=<page>` — Facebook's web share dialog, no
 *     app or app ID needed; it reads this page's own Open Graph tags.
 *     Opened inside the click (no await before it), so it isn't blocked
 *     as a popup.
 *   - Instagram/TikTok: no upload endpoint a third-party site can use, so
 *     the honest fallback is downloading the real file and saying plainly
 *     that the visitor can upload it in the app or on the website — no app
 *     or site is opened for them, and nothing claims it was posted.
 *
 * Only a completed share sheet (`isCompletedShare`) calls `onShared` —
 * opening Facebook's dialog or downloading never does.
 */
export function SocialShareActions({ pageUrl, imageUrl, fileNamePrefix, formatId, onShared }: SocialShareActionsProps) {
  const { dictionary } = useLocale();
  // Share sheet for the platform buttons: file sharing AND touch-primary.
  const [nativeSheet, setNativeSheet] = useState(false);
  const [hint, setHint] = useState<"instagram" | "tiktok" | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState(false);
  // Same as ShareCardPicker: a share sheet that ended without a share gets a
  // neutral note plus the same file as a download, keyed on the image URL.
  const [notCompleted, setNotCompleted] = useState<{ file: File; imageUrl: string } | null>(null);
  // EPIC 017: same real re-entrancy guard as ShareCardPicker — `isBusy`
  // state drives the disabled UI, but a synchronous ref is what actually
  // blocks a rapid double/triple-click from firing multiple concurrent
  // native-share or download calls (confirmed via a real rapid-triple-click
  // browser test before this fix: three navigator.share calls, not one).
  const busyRef = useRef(false);

  useEffect(() => {
    // Browser-only capability check — see LocaleProvider/onboarding for the
    // same "detect after mount, SSR-safe default" shape.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNativeSheet(supportsFileShare() && isTouchPrimaryDevice());
  }, []);

  // BUG FIX (EPIC 030): same root cause and fix as ShareCardPicker's own
  // fileRef — `await fetchImageAsFile(...)` before `navigator.share()`
  // reproducibly triggered `NotAllowedError: Must be handling a user
  // gesture...`, because Chrome revokes a click's transient activation
  // across any awaited async gap. Prefetching here means the click handler
  // below can call `navigator.share()` with an already-resolved File, no
  // `await` in front of it. Keyed on the *resolved* URL (not the `imageUrl`
  // prop itself, a fresh closure every render) so it also refetches
  // whenever the caller's underlying capture mode changes, not just format.
  const resolvedImageUrl = imageUrl();
  const fileRef = useRef<File | null>(null);
  useEffect(() => {
    let cancelled = false;
    fileRef.current = null;
    fetchImageAsFile(resolvedImageUrl, `${fileNamePrefix}-${formatId}.png`).then((file) => {
      if (!cancelled) fileRef.current = file;
    });
    return () => {
      cancelled = true;
    };
  }, [resolvedImageUrl, fileNamePrefix, formatId]);

  function openFacebookDialog() {
    window.open(facebookShareUrl(pageUrl), "_blank", FACEBOOK_DIALOG_FEATURES);
  }

  async function handlePlatformClick(platform: SocialPlatform) {
    // Single guard held for the whole click — native attempt AND a possible
    // fallback — rather than two separate busy windows with a gap between
    // them; see the `busyRef` comment above for why this needs to be a ref,
    // not just the `isBusy` state read below.
    if (busyRef.current) return;
    busyRef.current = true;
    setError(false);
    setHint(null);
    setNotCompleted(null);
    setIsBusy(true);
    try {
      if (socialShareRoute(platform, { nativeSheet }) === "native-sheet") {
        const file = fileRef.current ?? (await fetchImageAsFile(imageUrl(), `${fileNamePrefix}-${formatId}.png`));
        if (!file) {
          setError(true);
          return;
        }
        // Same as ShareCardPicker: no share attempt once the click's user
        // activation is gone — this platform's own fallback below instead.
        const outcome = hasUserActivation()
          ? await shareFile(file, { title: "MINDOT", text: dictionary.share.shareText })
          : "unsupported";
        if (isCompletedShare(outcome)) {
          onShared?.();
          return;
        }
        if (offersDownloadAfterShare(outcome)) {
          setNotCompleted({ file, imageUrl: resolvedImageUrl });
          return;
        }
        if (outcome === "failed") {
          setError(true);
          return;
        }
        // "unsupported" at click time despite the mount-time probe passing
        // — fall through to this platform's own real fallback below rather
        // than leaving the visitor stuck.
      }

      // The non-sheet routes (socialShareRoute): Facebook's web dialog, else a download.
      if (platform === "facebook") {
        openFacebookDialog();
        return;
      }

      // Instagram/TikTok: download only — no app or site is opened for the
      // visitor (see the component doc comment above).
      const file = fileRef.current ?? (await fetchImageAsFile(imageUrl(), `${fileNamePrefix}-${formatId}.png`));
      if (!file) {
        setError(true);
        return;
      }
      downloadFile(file);
      setHint(platform);
    } finally {
      busyRef.current = false;
      setIsBusy(false);
    }
  }

  const showNotCompleted = notCompleted !== null && notCompleted.imageUrl === resolvedImageUrl;

  const buttonClasses =
    // No `flex-1`: three fixed-content buttons (icon + label, deliberately
    // not truncated — a clipped "Face…" button reads as broken, not
    // responsive) in a row that can't itself shrink below their combined
    // natural width. `flex-1` there previously gave each button
    // `min-width: auto` (the flexbox default), which doesn't shrink to
    // fit either — the row silently overflowed its container and widened
    // the *entire page* horizontally on narrow viewports (confirmed: a
    // real, reproducible ~390px-viewport regression, not hypothetical).
    // `flex-wrap` on the row is what actually fixes it: on a screen too
    // narrow for three, the third button wraps to its own line instead of
    // pushing the page wider.
    // Secondary to ShareCardPicker's main button: no fill or shadow, a
    // lighter border — same size and focus ring, so still easy to tap.
    "flex items-center justify-center gap-2 rounded-md border border-border/70 bg-transparent px-3 py-2 text-xs font-medium text-ink-soft transition-colors hover:border-border hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange disabled:cursor-default disabled:opacity-60";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => handlePlatformClick("facebook")} disabled={isBusy} className={cn(buttonClasses)}>
          <FacebookIcon />
          {dictionary.share.socialFacebook}
        </button>
        <button type="button" onClick={() => handlePlatformClick("instagram")} disabled={isBusy} className={cn(buttonClasses)}>
          <InstagramIcon />
          {dictionary.share.socialInstagram}
        </button>
        <button type="button" onClick={() => handlePlatformClick("tiktok")} disabled={isBusy} className={cn(buttonClasses)}>
          <TiktokIcon />
          {dictionary.share.socialTiktok}
        </button>
      </div>

      {/* `hint` is only ever set by the fallback branch actually running
          (see handlePlatformClick) — checking that directly, rather than
          the mount-time `nativeSheet` flag, is deliberate: a click can
          still fall through to the fallback path even when
          `nativeSheet` was true at mount, since `shareFile()` re-checks
          `navigator.canShare` fresh at click time (the real, current
          capability) rather than trusting a stale snapshot. */}
      {nativeSheet && !hint && !error && !showNotCompleted && (
        <p role="status" className="text-xs text-ink-soft">
          {dictionary.share.socialNativeShareHint}
        </p>
      )}
      {hint && (
        <p role="status" className="text-xs text-ink-soft">
          {hint === "instagram" ? dictionary.share.socialInstagramHint : dictionary.share.socialTiktokHint}
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {dictionary.share.error}
        </p>
      )}
      {showNotCompleted && (
        <div role="status" className="flex flex-col items-start gap-1 text-xs text-ink-soft">
          <p>{dictionary.share.shareNotCompleted}</p>
          {/* A plain download — never onShared: it isn't a completed share. */}
          <button
            type="button"
            onClick={() => downloadFile(notCompleted.file)}
            className="rounded-sm font-medium text-navy underline underline-offset-2 hover:text-orange focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
          >
            {dictionary.share.downloadImage}
          </button>
        </div>
      )}
    </div>
  );
}

function FacebookIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 fill-current">
      <path d="M9.5 16v-6.2h2.1l.3-2.4H9.5V6c0-.7.2-1.2 1.2-1.2h1.3V2.6C11.7 2.6 10.9 2.5 10 2.5c-2 0-3.4 1.2-3.4 3.5v1.9H4.5v2.4h2.1V16h2.9Z" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 fill-none stroke-current" strokeWidth={1.3}>
      <rect x="2" y="2" width="12" height="12" rx="3.2" />
      <circle cx="8" cy="8" r="2.6" />
      <circle cx="11.6" cy="4.4" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

function TiktokIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 fill-current">
      <path d="M11.2 2c.2 1.4 1.1 2.4 2.5 2.6v1.9a4.5 4.5 0 0 1-2.5-.8v4.4a3.6 3.6 0 1 1-3.1-3.6v2a1.6 1.6 0 1 0 1.2 1.6V2h1.9Z" />
    </svg>
  );
}
