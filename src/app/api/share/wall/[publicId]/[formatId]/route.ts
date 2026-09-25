import { NextResponse, type NextRequest } from "next/server";
import { getPublicWall } from "@/features/profile/repository";
import { curateWallSelection } from "@/features/profile/lib/curateWallSelection";
import { getPublicShareFormat } from "@/features/sharing/config/shareFormats";
import { renderWallShareCard } from "@/features/sharing/services/shareCardRenderer";
import { getDictionary } from "@/i18n/translations";

export const runtime = "nodejs";

/**
 * Generates a branded share-card PNG for a personal wall. Public, no
 * sign-in required — a personal wall is only ever built from
 * `getPublicWall`, the same `status = "approved" AND is_anonymous = false
 * AND show_on_personal_wall = true` query the /u/[publicId] page itself
 * reads, so this can never render an anonymous note or anyone's private
 * archive regardless of who requests it (mirrors /api/share/note's
 * "public content, shareable by anyone" policy, not the Memory share
 * route's owner-only one). A disabled wall never even reaches a message
 * query (see getPublicWall) — this route 404s for it exactly like an
 * unknown publicId, never generating real content for a wall its owner
 * hasn't made public. Curated down to a small, deterministic set before
 * rendering — see features/profile/lib/curateWallSelection.ts.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ publicId: string; formatId: string }> }) {
  const { publicId, formatId } = await context.params;
  // Internal-only formats (the paid Memory PDF's print master) are never
  // generated here — checked before any lookup, not just hidden in the UI.
  const format = getPublicShareFormat(formatId);
  if (!format) {
    return NextResponse.json({ error: "format-not-available" }, { status: 404 });
  }

  const wall = await getPublicWall(publicId);
  if (wall.status !== "ok" || wall.notes.length === 0) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }

  const curated = curateWallSelection(wall.notes, 6);

  let image;
  try {
    image = await renderWallShareCard({
      displayName: wall.profile.displayName,
      notes: curated.map((note) => ({ content: note.content, templateId: note.templateId })),
      format,
      slogan: getDictionary("en").boardPage.slogan,
    });
  } catch (error) {
    console.error("renderWallShareCard failed", { formatId, error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "render-failed" }, { status: 500 });
  }

  // Not cached as aggressively as a single note's card: a wall's content
  // changes every time a new message is approved for this author, unlike
  // an individual note's permanent placement.
  image.headers.set("Cache-Control", "public, max-age=300, stale-while-revalidate=3600");
  return image;
}
