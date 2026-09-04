"use client";

import { useEffect, useState } from "react";
import { useLocale } from "@/i18n/LocaleProvider";
import { cn } from "@/lib/cn";
import { downloadFile, fetchImageAsFile, shareFile, supportsFileShare } from "../lib/nativeFileShare";

interface SocialShareActionsProps {
  /** The absolute, real page URL for this thought — what Facebook's share dialog actually reads Open Graph tags from. */
  pageUrl: string;
  /** The generated PNG's endpoint — the same real file every button hands off, one way or another. */
  imageUrl: () => string;
  fileNamePrefix: string;
}

/**
 * EPIC 016: real, honest platform hand-off — not a fake "posted for you"
 * action, and (as of this EPIC) no longer a button that just opens a
 * platform's homepage either.
 *
 * On a device that can actually accept a file into the OS share sheet
 * (`supportsFileShare()` — real feature detection, never a device/UA
 * guess), all three buttons hand the real generated PNG to
 * `navigator.share()`. Which app the visitor picks from that sheet
 * (Facebook, Instagram, TikTok, Messages, anything else installed) is the
 * OS's decision, not this component's — there is no web API that lets a
 * site target one specific app, so the three buttons converge on the same
 * call once native sharing is available. The persistent hint text below
 * the row exists specifically so this isn't a surprise: it tells the
 * visitor up front that pressing any of the three opens their phone's own
 * share menu.
 *
 * On a device without file-share support (most desktop browsers today),
 * each button falls back to the best *real* thing that platform supports:
 *   - Facebook: `sharer.php?u=<page>` — a genuine, no-app-ID-required share
 *     dialog that reads this page's own Open Graph tags. Still the
 *     officially-functional legacy endpoint (Meta's newer `dialog/share`
 *     requires an app ID this project doesn't have registered).
 *   - Instagram: there is no web upload endpoint for a third-party site at
 *     all (personal accounts have no public upload API, and Meta's Graph
 *     API publishing path requires a Business/Creator account + app
 *     review — irrelevant here). The only honest fallback is: download the
 *     real file, tell the visitor plainly, and stop — never open
 *     instagram.com and imply that helped.
 *   - TikTok: `tiktok.com/upload` is a real, existing desktop web upload
 *     page (requires the visitor's own TikTok login) that accepts a local
 *     file picker — download the file, then open that real page.
 */
export function SocialShareActions({ pageUrl, imageUrl, fileNamePrefix }: SocialShareActionsProps) {
  const { dictionary } = useLocale();
  const [nativeAvailable, setNativeAvailable] = useState(false);
  const [hint, setHint] = useState<"instagram" | "tiktok" | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    // Browser-only capability check — see LocaleProvider/onboarding for the
    // same "detect after mount, SSR-safe default" shape.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNativeAvailable(supportsFileShare());
  }, []);

  function openFacebookDialog() {
    const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}`;
    window.open(url, "_blank", "noopener,noreferrer,width=600,height=520");
  }

  async function handlePlatformClick(platform: "facebook" | "instagram" | "tiktok") {
    if (isBusy) return;
    setError(false);
    setHint(null);

    if (nativeAvailable) {
      setIsBusy(true);
      try {
        const file = await fetchImageAsFile(imageUrl(), `${fileNamePrefix}.png`);
        if (!file) {
          setError(true);
          return;
        }
        const outcome = await shareFile(file, { title: "MINDOT", text: dictionary.share.shareText });
        if (outcome === "shared" || outcome === "cancelled") return;
        if (outcome === "failed") {
          setError(true);
          return;
        }
        // "unsupported" at click time despite the mount-time probe passing
        // — fall through to this platform's own real fallback below rather
        // than leaving the visitor stuck.
      } finally {
        setIsBusy(false);
      }
    }

    if (platform === "facebook") {
      openFacebookDialog();
      return;
    }

    setIsBusy(true);
    try {
      const file = await fetchImageAsFile(imageUrl(), `${fileNamePrefix}.png`);
      if (!file) {
        setError(true);
        return;
      }
      downloadFile(file);
      setHint(platform);
      if (platform === "tiktok") {
        window.open("https://www.tiktok.com/upload", "_blank", "noopener,noreferrer");
      }
      // Instagram: deliberately no window.open — see the component doc
      // comment above for why opening instagram.com isn't a real fallback.
    } finally {
      setIsBusy(false);
    }
  }

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
    "flex items-center justify-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-xs font-medium text-ink-soft shadow-card transition-colors hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange disabled:cursor-default disabled:opacity-60";

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
          the mount-time `nativeAvailable` flag, is deliberate: a click can
          still fall through to the fallback path even when
          `nativeAvailable` was true at mount, since `shareFile()` re-checks
          `navigator.canShare` fresh at click time (the real, current
          capability) rather than trusting a stale snapshot. */}
      {nativeAvailable && !hint && !error && (
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
