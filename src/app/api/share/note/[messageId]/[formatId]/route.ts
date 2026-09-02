import { NextResponse, type NextRequest } from "next/server";
import { getPublicMessageById } from "@/features/board/repository";
import { resolveCaptureRegion } from "@/features/memories/lib/captureRegion";
import type { MemoryCaptureMode } from "@/features/memories/types";
import { getShareFormat } from "@/features/sharing/config/shareFormats";
import { sloganForLanguage, toShareCardNote } from "@/features/sharing/lib/shareCardData";
import { renderShareCard } from "@/features/sharing/services/shareCardRenderer";

export const runtime = "nodejs";

/**
 * Generates a branded share-card PNG for any single approved board note.
 * Public content, so no sign-in is required — the only gate is
 * `getPublicMessageById`, the same approved-only, anonymous-safe read the
 * board itself uses, so a pending/rejected message can never produce a
 * card and an anonymous author's identity never enters the image.
 * `?mode=note_with_surrounding` reuses the exact wall-region capture the
 * Memory flow uses (features/memories/lib/captureRegion.ts) — never a
 * second capture implementation.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ messageId: string; formatId: string }> }) {
  const { messageId, formatId } = await context.params;
  const requestedMode = new URL(request.url).searchParams.get("mode");
  const captureMode: MemoryCaptureMode = requestedMode === "note_with_surrounding" ? "note_with_surrounding" : "note_only";

  const message = await getPublicMessageById(messageId);
  if (!message) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }

  const region = await resolveCaptureRegion(message, captureMode);
  const format = getShareFormat(formatId);

  const image = renderShareCard({
    primary: toShareCardNote(region.primary),
    surrounding: region.surrounding.map(toShareCardNote),
    format,
    slogan: sloganForLanguage(message.language),
  });

  // Approved placement is permanent (see "Board / tile architecture" in
  // CLAUDE.md), so the same messageId+mode+format always renders the same
  // bytes — safe to cache at the edge/CDN, not just the browser.
  image.headers.set("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
  return image;
}
