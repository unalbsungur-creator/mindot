/**
 * EPIC 016: the one place that talks to the Web Share API (Level 2, file
 * sharing) — shared by `ShareCardPicker` (the generic "share image" action)
 * and `SocialShareActions` (the Facebook/Instagram/TikTok buttons), so
 * there is exactly one implementation of "does this browser really support
 * sharing a file, and how do we hand one off" rather than two. See
 * CLAUDE.md's "Web Share API + fallback" section — this file is that
 * mechanism, extracted so a second caller doesn't reinvent it.
 *
 * Nothing here fakes platform capability: every function reflects the
 * browser's own `navigator.share`/`navigator.canShare`, never a guess based
 * on user-agent sniffing or device type.
 */

// A minimal 1x1 transparent PNG, used only to feature-detect whether this
// browser's `navigator.canShare()` actually accepts files — some browsers
// expose `navigator.share` for URLs/text only, not files, and the only
// reliable way to ask is with a real File instance. No network request:
// this is decoded from a constant, not fetched.
const PROBE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function decodePngProbe(): File {
  const binary = atob(PROBE_PNG_BASE64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], "probe.png", { type: "image/png" });
}

/**
 * True only when this browser can actually hand a File to the OS-level
 * share sheet — not just when `navigator.share` exists (older desktop
 * implementations support sharing a URL/text but not files). Safe to call
 * on the server (returns false) since `navigator` is undefined there.
 */
export function supportsFileShare(): boolean {
  if (typeof navigator === "undefined") return false;
  if (typeof navigator.share !== "function" || typeof navigator.canShare !== "function") return false;
  try {
    return navigator.canShare({ files: [decodePngProbe()] });
  } catch {
    return false;
  }
}

/**
 * Whether the current click still counts as a user gesture —
 * `navigator.share()` rejects with NotAllowedError otherwise (e.g. after an
 * awaited fetch). Browsers without the User Activation API report true:
 * there is nothing to check, so the share is attempted as before. Callers
 * use this to go straight to their fallback instead of a share that can
 * only fail.
 */
export function hasUserActivation(): boolean {
  if (typeof navigator === "undefined") return false;
  const activation = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
  return activation ? activation.isActive : true;
}

export type ShareFileOutcome = "shared" | "cancelled" | "unsupported" | "failed";

/**
 * Whether a share counts as completed — only the share sheet resolving
 * ("shared"). That means a target was picked (which may also be "Save
 * Image" or "Copy"), not that anything was published. A download, a
 * platform fallback, a cancel or a failure never counts.
 */
export function isCompletedShare(outcome: ShareFileOutcome): boolean {
  return outcome === "shared";
}

/**
 * Hands a real file to the OS share sheet. Never throws — a user
 * dismissing the sheet (AbortError) is reported as "cancelled", not a
 * failure, matching how `ShareCardPicker` already treated this case.
 */
export async function shareFile(file: File, meta: { title?: string; text?: string } = {}): Promise<ShareFileOutcome> {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function" || typeof navigator.canShare !== "function") {
    return "unsupported";
  }
  if (!navigator.canShare({ files: [file] })) {
    return "unsupported";
  }
  try {
    // Only non-empty fields: iOS offers an extra text item next to the file
    // otherwise, which muddies "Save to Files" for a document.
    await navigator.share({
      files: [file],
      ...(meta.title ? { title: meta.title } : {}),
      ...(meta.text ? { text: meta.text } : {}),
    });
    return "shared";
  } catch (error) {
    // Development only: which rejection this was — e.g. Chrome on Windows
    // reports a dismissal as AbortError "Share canceled" but a share sheet
    // that never asked for the data (its 30 s timeout) as AbortError
    // "Share failed"; both stay "cancelled" below. Name and message only,
    // never the file.
    if (process.env.NODE_ENV === "development" && error instanceof Error) {
      console.warn("[share] navigator.share rejected:", error.name, error.message);
    }
    if (error instanceof Error && error.name === "AbortError") return "cancelled";
    return "failed";
  }
}

/**
 * Whether to tell the visitor the share didn't complete and offer the same
 * file as a download — only for "cancelled". An AbortError can be a real
 * dismissal or a browser-side failure, and the two can't be told apart
 * reliably, so the note stays neutral. "failed" keeps its error message,
 * "unsupported" already falls back on its own, and "shared" is done. The
 * download never counts as a share (see `isCompletedShare`).
 */
export function offersDownloadAfterShare(outcome: ShareFileOutcome): boolean {
  return outcome === "cancelled";
}

/**
 * Fetches a generated share-card PNG and wraps it as a real File — the one
 * place both share components turn an `/api/share/...` endpoint response
 * into something `shareFile`/`downloadFile` can use. Rejects anything that
 * isn't actually an image (a non-2xx response, or an unexpected content
 * type) rather than silently sharing/downloading whatever came back.
 */
export async function fetchImageAsFile(url: string, filename: string): Promise<File | null> {
  const response = await fetch(url);
  if (!response.ok) return null;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) return null;
  const blob = await response.blob();
  return new File([blob], filename, { type: "image/png" });
}

/**
 * Triggers a normal browser download of a File via a temporary object URL —
 * the fallback used wherever native file sharing isn't available. The link
 * is attached while clicked (older Firefox ignores detached anchors) and
 * the URL is revoked a little later, not synchronously, since some
 * browsers (Safari) start reading the blob only after click() returns.
 */
export function downloadFile(file: File): void {
  const objectUrl = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = file.name;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}
