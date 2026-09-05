import type { Metadata } from "next";
import { getPublicWall } from "@/features/profile/repository";
import { parseTimeRangeParams } from "@/features/profile/lib/timeRange";
import { PublicWallContent } from "./_components/PublicWallContent";

export const dynamic = "force-dynamic";

const EXCERPT_MAX_CHARS = 120;
// EPIC 024: same page-size convention as /me/archive — the old flat
// PERSONAL_WALL_LIMIT (60) becomes the page size, not a ceiling.
const PAGE_SIZE = 60;

function parsePage(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

/**
 * Privacy-safe by construction: built entirely from getPublicWall, which
 * never queries messages at all for a disabled wall (see
 * features/profile/repository.ts) and only returns approved, named
 * messages otherwise — same guarantee as /memory/[messageId]'s
 * generateMetadata. A disabled wall gets fully generic metadata (no
 * display name) even though the page itself may still show the owner's
 * identity alongside a "private" message — a shared link's preview card
 * shouldn't reveal that on its own. An enabled-but-empty wall keeps its
 * own title (already visible on the page) but no content-derived Open
 * Graph preview, since there's no content yet to preview.
 */
export async function generateMetadata({ params }: PageProps<"/u/[publicId]">): Promise<Metadata> {
  const { publicId } = await params;
  const wall = await getPublicWall(publicId);
  // Nothing to index for an unknown or intentionally-private wall — robots.ts
  // allows crawling under /u/ broadly since most walls are meant to be
  // found, but a "not-found"/"disabled" response here is empty/private
  // content with no SEO value, so it opts out per-page rather than relying
  // on the site-wide allow rule to sort it out.
  if (wall.status !== "ok") return { title: "MINDOT", robots: { index: false, follow: true } };

  const hasContent = wall.notes.length > 0;
  const description = hasContent
    ? wall.notes[0].content.length > EXCERPT_MAX_CHARS
      ? `${wall.notes[0].content.slice(0, EXCERPT_MAX_CHARS)}…`
      : wall.notes[0].content
    : undefined;

  return {
    title: wall.profile.displayName,
    description,
    alternates: { canonical: `/u/${publicId}` },
    openGraph: hasContent
      ? { title: `${wall.profile.displayName} — MINDOT`, description, url: `/u/${publicId}` }
      : { title: "MINDOT", url: `/u/${publicId}` },
    twitter: hasContent
      ? { card: "summary_large_image", title: `${wall.profile.displayName} — MINDOT`, description }
      : { card: "summary_large_image" },
  };
}

export default async function PublicWallPage({ params, searchParams }: PageProps<"/u/[publicId]">) {
  const { publicId } = await params;
  const sp = await searchParams;
  const range = parseTimeRangeParams(sp);
  const requestedPage = parsePage(typeof sp.page === "string" ? sp.page : undefined);

  const firstAttempt = await getPublicWall(publicId, range, { limit: PAGE_SIZE, offset: (requestedPage - 1) * PAGE_SIZE });

  // Only the "ok" branch has pagination to clamp — "not-found"/"disabled"
  // never queried messages at all, so there's nothing to page through.
  if (firstAttempt.status !== "ok") {
    return <PublicWallContent publicId={publicId} wall={firstAttempt} page={1} totalPages={1} />;
  }

  const totalPages = Math.max(1, Math.ceil(firstAttempt.total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const wall =
    page === requestedPage
      ? firstAttempt
      : await getPublicWall(publicId, range, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });

  return <PublicWallContent publicId={publicId} wall={wall} page={page} totalPages={totalPages} />;
}
