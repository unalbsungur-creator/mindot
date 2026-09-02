"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useLocale } from "@/i18n/LocaleProvider";
import { cn } from "@/lib/cn";
import { shareFormats } from "../config/shareFormats";

interface ShareCardPickerProps {
  /** Builds the PNG endpoint URL for a given format id — the caller owns which subject (note vs. memory) and query params (e.g. `?mode=`) this points at. */
  imageEndpoint: (formatId: string) => string;
  fileNamePrefix: string;
}

/**
 * Format picker + live preview + the actual share/download action.
 * Reused by both the standalone `/share/[messageId]` flow and the Memory
 * Project outcome panels — one component, so "share a branded image" only
 * has one implementation of the Web Share API / download-fallback logic.
 * See "Web Share API + fallback" in CLAUDE.md.
 */
export function ShareCardPicker({ imageEndpoint, fileNamePrefix }: ShareCardPickerProps) {
  const { dictionary } = useLocale();
  const [formatId, setFormatId] = useState(shareFormats[0].id);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState(false);
  const imageUrl = imageEndpoint(formatId);

  async function handleShareOrDownload() {
    setError(false);
    setIsBusy(true);
    try {
      const response = await fetch(imageUrl);
      if (!response.ok) {
        setError(true);
        return;
      }
      const blob = await response.blob();
      const file = new File([blob], `${fileNamePrefix}-${formatId}.png`, { type: "image/png" });

      if (
        typeof navigator !== "undefined" &&
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] })
      ) {
        await navigator.share({ files: [file], title: "MINDOT", text: dictionary.share.shareText });
        return;
      }

      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `${fileNamePrefix}-${formatId}.png`;
      link.click();
      URL.revokeObjectURL(objectUrl);
    } catch {
      // A user cancelling the native share sheet also lands here (AbortError) — not a real failure, so stay quiet rather than showing an error for a cancel.
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        {shareFormats.map((format) => (
          <button
            key={format.id}
            type="button"
            onClick={() => setFormatId(format.id)}
            className={cn(
              "rounded-pill border px-3 py-1 text-xs font-medium transition-colors",
              formatId === format.id
                ? "border-orange bg-orange text-navy"
                : "border-border text-ink-soft hover:text-navy"
            )}
          >
            {format.name}
          </button>
        ))}
      </div>

      <div className="flex justify-center overflow-hidden rounded-lg border border-border bg-canvas p-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- server-generated PNG, not an optimizable next/image asset */}
        <img key={imageUrl} src={imageUrl} alt="" className="max-h-72 w-auto rounded" />
      </div>

      {error && <p className="text-sm text-red-600">{dictionary.share.error}</p>}

      <Button onClick={handleShareOrDownload} disabled={isBusy}>
        {isBusy ? dictionary.share.sharing : dictionary.share.shareButton}
      </Button>
    </div>
  );
}
