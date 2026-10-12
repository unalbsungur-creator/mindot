/**
 * The one download route's URL (api/memories/[projectId]/download). The
 * personal PDF's "View PDF" link and its download button build it here, so
 * both always carry the same chosen design. `backgroundId` is omitted when
 * not given — the route then uses the default design.
 */
export function memoryPdfUrl(projectId: string, options: { backgroundId?: string | null; inline?: boolean } = {}): string {
  const params: string[] = [];
  if (options.inline) params.push("disposition=inline");
  if (options.backgroundId) params.push(`background=${encodeURIComponent(options.backgroundId)}`);
  return `/api/memories/${projectId}/download${params.length ? `?${params.join("&")}` : ""}`;
}
