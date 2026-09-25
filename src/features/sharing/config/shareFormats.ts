import type { ShareFormat } from "../types";

/**
 * The share-card format registry — same philosophy as `noteTemplates` and
 * `frameTemplates`: add a future size (e.g. a 1080x1350 portrait post) by
 * adding an entry here, never by writing a new renderer. Square is listed
 * first because it's the priority default across every share entry point;
 * Story is the secondary option.
 */
export const shareFormats: ShareFormat[] = [
  { id: "square", name: "Square", width: 1080, height: 1080 },
  { id: "story", name: "Story", width: 1080, height: 1920 },
  // Memory Print master — same renderer, same registry, just a bigger
  // canvas at a print-appropriate portrait ratio (4:5, matching this
  // project's existing portrait-first orientation convention — see
  // features/memories/config/frameTemplates.ts, whose only two
  // orientations are "portrait"/"landscape" with portrait as the default
  // for every non-gallery frame). 2880x3600 clears the requested "at
  // least 2400px short edge, ~3000-3600px long edge" print target at
  // exactly 300 DPI for a 9.6in x 12in print. This is the exact image the
  // paid Memory PDF wraps (features/memories/services/pdf.tsx), so it is
  // internal-only: every public share route rejects it via
  // `getPublicShareFormat` below — `showInPicker: false` alone only hides
  // it in the UI.
  { id: "print", name: "Print Master", width: 2880, height: 3600, showInPicker: false },
];

export function getShareFormat(id: string): ShareFormat {
  return shareFormats.find((format) => format.id === id) ?? shareFormats[0];
}

/**
 * The format lookup for the public `/api/share/*` routes — the actual
 * security boundary for internal-only formats. Returns `null` for any
 * format not offered in the share picker (`showInPicker: false`, i.e.
 * `print`), so it can never be generated through a share endpoint by
 * guessing the URL. Unknown ids keep `getShareFormat`'s square fallback.
 */
export function getPublicShareFormat(id: string): ShareFormat | null {
  const format = getShareFormat(id);
  return format.showInPicker === false ? null : format;
}
