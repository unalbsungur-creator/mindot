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
];

export function getShareFormat(id: string): ShareFormat {
  return shareFormats.find((format) => format.id === id) ?? shareFormats[0];
}
