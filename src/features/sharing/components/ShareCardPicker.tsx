"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useLocale } from "@/i18n/LocaleProvider";
import { cn } from "@/lib/cn";
import { shareFormats } from "../config/shareFormats";
import { downloadFile, fetchImageAsFile, shareFile } from "../lib/nativeFileShare";

interface ShareCardPickerProps {
  /** Builds the PNG endpoint URL for a given format id — the caller owns which subject (note vs. memory) and query params (e.g. `?mode=`) this points at. */
  imageEndpoint: (formatId: string) => string;
  fileNamePrefix: string;
  /**
   * EPIC 017: optional controlled format selection. Omit both this and
   * `onFormatChange` for the original uncontrolled behavior (this
   * component owns its own selected format, defaulting to the first
   * picker format) — every existing caller (Memory outcome panels,
   * personal-wall share) keeps working unchanged. Pass both when a sibling
   * component needs to know/drive the same format the user is previewing
   * here — see `SharePageContent`, which lifts this so its
   * Facebook/Instagram/TikTok buttons always share the exact format
   * currently shown in this picker's own preview, never a stale/hardcoded
   * one.
   */
  formatId?: string;
  onFormatChange?: (formatId: string) => void;
}

/**
 * Format picker + live preview + the actual share/download action.
 * Reused by both the standalone `/share/[messageId]` flow and the Memory
 * Project outcome panels — one component, so "share a branded image" only
 * has one implementation of the Web Share API / download-fallback logic.
 * See "Web Share API + fallback" in CLAUDE.md.
 */
const pickerFormats = shareFormats.filter((format) => format.showInPicker !== false);

export function ShareCardPicker({
  imageEndpoint,
  fileNamePrefix,
  formatId: controlledFormatId,
  onFormatChange,
}: ShareCardPickerProps) {
  const { dictionary } = useLocale();
  const [internalFormatId, setInternalFormatId] = useState(pickerFormats[0].id);
  const formatId = controlledFormatId ?? internalFormatId;
  function selectFormat(id: string) {
    if (onFormatChange) onFormatChange(id);
    else setInternalFormatId(id);
  }
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState(false);
  const imageUrl = imageEndpoint(formatId);
  // EPIC 017: the real re-entrancy guard. `isBusy` (state) drives the
  // button's `disabled` attribute for the UI, but two clicks fired close
  // enough together both read the same stale `isBusy=false` closure before
  // React commits the first click's `setIsBusy(true)` — confirmed via a
  // real rapid-triple-click browser test producing three separate
  // navigator.share calls. A ref is synchronous and shared across those
  // closures immediately, so it actually blocks re-entry within the same
  // tick, which state alone can't.
  const busyRef = useRef(false);

  // BUG FIX (EPIC 030): "Görseli paylaş" reproducibly failed with
  // `NotAllowedError: Must be handling a user gesture to perform a share
  // request` on every real click — confirmed by instrumenting
  // navigator.share() directly. Root cause: `await fetchImageAsFile(...)`
  // below used to run *before* `navigator.share()`, and Chrome revokes a
  // click's transient user-activation across any awaited async gap (a
  // network fetch is exactly that gap) — by the time the fetch resolved,
  // the browser no longer considered the call user-initiated, so it
  // rejected unconditionally, every time, regardless of network speed.
  // This effect fetches the file ahead of the click instead, so the click
  // handler below can hand `navigator.share()` an already-resolved File
  // with no `await` in front of it, preserving activation.
  const fileRef = useRef<File | null>(null);
  useEffect(() => {
    let cancelled = false;
    fileRef.current = null;
    fetchImageAsFile(imageUrl, `${fileNamePrefix}-${formatId}.png`).then((file) => {
      if (!cancelled) fileRef.current = file;
    });
    return () => {
      cancelled = true;
    };
  }, [imageUrl, fileNamePrefix, formatId]);

  async function handleShareOrDownload() {
    if (busyRef.current) return;
    busyRef.current = true;
    setError(false);
    setIsBusy(true);
    try {
      // Reads the already-prefetched file (no await) whenever it's ready;
      // only falls back to a fresh, awaited fetch in the rare case a click
      // lands before the effect above has resolved.
      const file = fileRef.current ?? (await fetchImageAsFile(imageUrl, `${fileNamePrefix}-${formatId}.png`));
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
      // "unsupported": this browser can't take a file share — fall back to
      // a normal download, same file, same content.
      downloadFile(file);
    } finally {
      busyRef.current = false;
      setIsBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        {pickerFormats.map((format) => (
          <button
            key={format.id}
            type="button"
            onClick={() => selectFormat(format.id)}
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
