"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useLocale } from "@/i18n/LocaleProvider";
import { cn } from "@/lib/cn";
import { shareFormats } from "../config/shareFormats";
import {
  downloadFile,
  fetchImageAsFile,
  hasUserActivation,
  isCompletedShare,
  offersDownloadAfterShare,
  shareFile,
} from "../lib/nativeFileShare";

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
  /** Called only after the OS share sheet completed ("shared") — never for a download, cancel or failure. */
  onShared?: () => void;
  /** Replaces the main button's default label (e.g. the share page's first-share reward offer). */
  shareButtonLabel?: string;
  /** A short note under the main button, announced with it via aria-describedby. */
  shareHint?: string;
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
  onShared,
  shareButtonLabel,
  shareHint,
}: ShareCardPickerProps) {
  const { dictionary } = useLocale();
  const hintId = useId();
  const [internalFormatId, setInternalFormatId] = useState(pickerFormats[0].id);
  const formatId = controlledFormatId ?? internalFormatId;
  function selectFormat(id: string) {
    if (onFormatChange) onFormatChange(id);
    else setInternalFormatId(id);
  }
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState(false);
  // The share sheet ended without a share ("cancelled"): a neutral note
  // pointing at the download link below. Keyed on the image URL, so picking
  // another format hides it.
  const [notCompletedImageUrl, setNotCompletedImageUrl] = useState<string | null>(null);
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
  // The download link's own guard — separate from busyRef on purpose, so a
  // download never waits for a pending share sheet (Chrome on Windows can
  // hold one for 30 s before failing).
  const downloadBusyRef = useRef(false);

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
    setNotCompletedImageUrl(null);
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

      // A late click that had to await the fetch above may have lost its
      // user activation; then go straight to the download fallback.
      const outcome = hasUserActivation()
        ? await shareFile(file, { title: "MINDOT", text: dictionary.share.shareText })
        : "unsupported";
      if (isCompletedShare(outcome)) {
        onShared?.();
        return;
      }
      if (offersDownloadAfterShare(outcome)) {
        setNotCompletedImageUrl(imageUrl);
        return;
      }
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

  // Always available, also while a share is pending: the same prepared File
  // (a File is immutable, so the share sheet and a download can both read
  // it). A plain download — never onShared, so it never claims the reward.
  async function handleDownload() {
    if (downloadBusyRef.current) return;
    downloadBusyRef.current = true;
    try {
      const file = fileRef.current ?? (await fetchImageAsFile(imageUrl, `${fileNamePrefix}-${formatId}.png`));
      if (!file) {
        setError(true);
        return;
      }
      downloadFile(file);
    } catch {
      setError(true);
    } finally {
      downloadBusyRef.current = false;
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
            {dictionary.share.formatNames[format.id] ?? format.name}
          </button>
        ))}
      </div>

      <div className="flex justify-center overflow-hidden rounded-lg border border-border bg-canvas p-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- server-generated PNG, not an optimizable next/image asset */}
        <img key={imageUrl} src={imageUrl} alt="" className="max-h-72 w-auto rounded" />
      </div>

      {error && <p className="text-sm text-red-600">{dictionary.share.error}</p>}
      {notCompletedImageUrl === imageUrl && (
        <p role="status" className="text-center text-sm text-ink-soft">
          {dictionary.share.shareNotCompleted}
        </p>
      )}

      <Button
        onClick={handleShareOrDownload}
        disabled={isBusy}
        aria-describedby={shareHint ? hintId : undefined}
        className="text-center"
      >
        {isBusy ? dictionary.share.sharing : (shareButtonLabel ?? dictionary.share.shareButton)}
      </Button>
      {shareHint && (
        <p id={hintId} className="-mt-2 text-center text-xs text-ink-soft">
          {shareHint}
        </p>
      )}
      {/* Not disabled by isBusy: see handleDownload. */}
      <button
        type="button"
        onClick={handleDownload}
        className="-mt-2 self-center rounded-sm text-xs font-medium text-ink-soft underline underline-offset-2 hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
      >
        {dictionary.share.downloadImage}
      </button>
    </div>
  );
}
