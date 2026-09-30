"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { downloadFile, shareFile } from "@/features/sharing/lib/nativeFileShare";
import { useLocale } from "@/i18n/LocaleProvider";
import { cn } from "@/lib/cn";

type Phase = "idle" | "preparing" | "ready";

/**
 * iPhone/iPad only. iOS Safari (and a home-screen web app) tends to open a
 * navigated-to PDF full-screen in its own viewer even with
 * `Content-Disposition: attachment`, and doesn't reliably honor `download`
 * on a blob link either — its native way to keep a file is the share
 * sheet's "Save to Files". No capability check can tell those apart, so
 * this is the one platform check; iPadOS reports itself as a Mac, hence the
 * touch-point test.
 */
function isAppleTouchDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}

function filenameFrom(response: Response, fallback: string): string {
  const match = /filename="([^"]+)"/.exec(response.headers.get("content-disposition") ?? "");
  return match?.[1] ?? fallback;
}

/**
 * "Download PDF" that never navigates away from MINDOT. Fetches the one
 * existing download route — same cookies, same server-side gate, a read
 * that never spends a Token — and hands the bytes off in place: a normal
 * file download on desktop/Android, the share sheet ("Save to Files") on
 * iPhone/iPad. The PDF is rendered on demand, so the click may wait long
 * enough for iOS to drop the tap's user activation; the prepared file is
 * then kept and a second tap on "Save PDF" opens the sheet with a fresh one.
 * Never prefetched: the render is memory-heavy.
 */
export function PdfDownloadButton({ projectId, className }: { projectId: string; className?: string }) {
  const { dictionary } = useLocale();
  const t = dictionary.memory;
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState(false);
  const busyRef = useRef(false);
  const fileRef = useRef<File | null>(null);

  async function saveOnAppleDevice(file: File) {
    const outcome = await shareFile(file);
    if (outcome === "unsupported") {
      // Share sheet can't take files (old iOS) — best effort download.
      downloadFile(file);
      setPhase("idle");
      return;
    }
    // shared/cancelled: keep the file so another tap re-opens the sheet
    // without re-rendering. failed: usually the tap's activation expired
    // while the PDF rendered — the "Save PDF" tap retries with a fresh one.
    setPhase("ready");
  }

  async function handleClick() {
    if (busyRef.current) return;
    setError(false);

    const prepared = fileRef.current;
    if (phase === "ready" && prepared) {
      // No await before the share call: it must run inside this tap.
      await saveOnAppleDevice(prepared);
      return;
    }

    busyRef.current = true;
    setPhase("preparing");
    try {
      const response = await fetch(`/api/memories/${projectId}/download`, { cache: "no-store", credentials: "same-origin" });
      if (!response.ok || !(response.headers.get("content-type") ?? "").startsWith("application/pdf")) {
        setError(true);
        setPhase("idle");
        return;
      }
      const blob = await response.blob();
      const file = new File([blob], filenameFrom(response, `mindot-memory-${projectId.slice(0, 8)}.pdf`), {
        type: "application/pdf",
      });

      if (isAppleTouchDevice()) {
        fileRef.current = file;
        await saveOnAppleDevice(file);
      } else {
        downloadFile(file);
        setPhase("idle");
      }
    } catch {
      setError(true);
      setPhase("idle");
    } finally {
      busyRef.current = false;
    }
  }

  return (
    <span className={cn("inline-flex flex-col items-start gap-1", className)}>
      <Button type="button" size="sm" onClick={handleClick} disabled={phase === "preparing"} aria-busy={phase === "preparing"}>
        {phase === "preparing"
          ? t.pdfPreparing
          : phase === "ready"
            ? t.pdfSaveButton
            : dictionary.adminOrders.downloadPdfButton}
      </Button>
      <span role="status" aria-live="polite" className="text-xs">
        {error ? (
          <span className="text-red-600">{t.pdfDownloadError}</span>
        ) : phase === "ready" ? (
          <span className="max-w-xs text-ink-soft">{t.pdfSaveHint}</span>
        ) : null}
      </span>
    </span>
  );
}
