"use client";

import { useState } from "react";
import { useLocale } from "@/i18n/LocaleProvider";
import { cn } from "@/lib/cn";

interface SocialShareActionsProps {
  /** The absolute, real page URL for this thought — what Facebook's share dialog actually reads Open Graph tags from. */
  pageUrl: string;
  /** The generated PNG's endpoint — downloaded on the visitor's behalf before opening Instagram/TikTok, since neither platform accepts an arbitrary image from a third-party site over the web. */
  imageUrl: () => string;
  fileNamePrefix: string;
}

/**
 * Real, honest platform hand-off — not a fake "posted for you" action. Only
 * Facebook has a genuine web share endpoint that accepts a URL
 * (`sharer.php`) and renders it using that page's own Open Graph tags
 * (`/share/[messageId]/opengraph-image.tsx` supplies those). Instagram and
 * TikTok have no equivalent for an arbitrary third-party website — their
 * own platforms only accept posts from their native apps or a registered
 * developer app — so for those two this downloads the branded image (the
 * same fetch-then-download path `ShareCardPicker` already uses) and opens
 * the platform's own site, with inline copy telling the visitor exactly
 * what just happened, rather than implying a one-click cross-post that
 * doesn't actually exist.
 */
export function SocialShareActions({ pageUrl, imageUrl, fileNamePrefix }: SocialShareActionsProps) {
  const { dictionary } = useLocale();
  const [hint, setHint] = useState<"instagram" | "tiktok" | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  function openFacebook() {
    const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}`;
    window.open(url, "_blank", "noopener,noreferrer,width=600,height=520");
  }

  async function downloadThenOpen(platform: "instagram" | "tiktok") {
    setIsBusy(true);
    setHint(null);
    try {
      const response = await fetch(imageUrl());
      if (response.ok) {
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = `${fileNamePrefix}.png`;
        link.click();
        URL.revokeObjectURL(objectUrl);
      }
    } catch {
      // Download failing here just means the visitor opens the platform without a pre-downloaded file — not worth a hard error for a convenience step.
    } finally {
      setIsBusy(false);
      setHint(platform);
      window.open(platform === "instagram" ? "https://www.instagram.com/" : "https://www.tiktok.com/upload", "_blank", "noopener,noreferrer");
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
        <button type="button" onClick={openFacebook} className={cn(buttonClasses)}>
          <FacebookIcon />
          {dictionary.share.socialFacebook}
        </button>
        <button type="button" onClick={() => downloadThenOpen("instagram")} disabled={isBusy} className={cn(buttonClasses)}>
          <InstagramIcon />
          {dictionary.share.socialInstagram}
        </button>
        <button type="button" onClick={() => downloadThenOpen("tiktok")} disabled={isBusy} className={cn(buttonClasses)}>
          <TiktokIcon />
          {dictionary.share.socialTiktok}
        </button>
      </div>
      {hint && (
        <p role="status" className="text-xs text-ink-soft">
          {hint === "instagram" ? dictionary.share.socialInstagramHint : dictionary.share.socialTiktokHint}
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
