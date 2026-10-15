import { NextResponse, type NextRequest } from "next/server";
import { getPublicWallShareNotes } from "@/features/profile/repository";
import { getPublicShareFormat } from "@/features/sharing/config/shareFormats";
import { MAX_WALL_CARDS, type WallFormat } from "@/features/sharing/lib/wallLayout";
import { renderWallShareCard, renderWallShareCardV2 } from "@/features/sharing/services/shareCardRenderer";
import { getDictionary } from "@/i18n/translations";

export const runtime = "nodejs";

/**
 * Generates a branded share-card PNG for a personal wall. Public, no
 * sign-in required — a personal wall is only ever read through the same
 * gate as /u/[publicId] (`getPublicWallShareNotes` shares `getPublicWall`'s:
 * unknown, not public or not consented → 404) and the same `status =
 * "approved" AND is_anonymous = false AND show_on_personal_wall = true`
 * filter, so this can never render an anonymous note or anyone's private
 * archive regardless of who requests it (mirrors /api/share/note's
 * "public content, shareable by anyone" policy, not the Memory share
 * route's owner-only one). A disabled wall never even reaches a message
 * query.
 *
 * The cards are the wall's newest (4 on a square, 8 on a story) drawn as
 * the real cards (`renderWallShareCardV2`). That render is buffered here so
 * a failure is caught — `ImageResponse` otherwise renders while streaming,
 * after this handler has returned — and falls back to the plain-card
 * `renderWallShareCard`, which the wall's Open Graph image still uses.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ publicId: string; formatId: string }> }) {
  const { publicId, formatId } = await context.params;
  // Internal-only formats (the paid Memory PDF's print master) are never
  // generated here — checked before any lookup, not just hidden in the UI.
  const format = getPublicShareFormat(formatId);
  if (!format) {
    return NextResponse.json({ error: "format-not-available" }, { status: 404 });
  }

  const wall = await getPublicWallShareNotes(publicId, MAX_WALL_CARDS[format.id as WallFormat] ?? MAX_WALL_CARDS.square);
  if (wall.status !== "ok" || wall.notes.length === 0) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }
  const slogan = getDictionary("en").boardPage.slogan;

  let image: Response;
  try {
    const rendered = await renderWallShareCardV2({ displayName: wall.profile.displayName, notes: wall.notes, format, slogan });
    image = new Response(await rendered.arrayBuffer(), { headers: rendered.headers });
  } catch (error) {
    console.error("renderWallShareCardV2 failed, falling back to the plain wall card", { formatId, error: error instanceof Error ? error.message : String(error) });
    try {
      image = await renderWallShareCard({
        displayName: wall.profile.displayName,
        notes: wall.notes.map((note) => ({ content: note.content, templateId: note.templateId })),
        format,
        slogan,
      });
    } catch (fallbackError) {
      console.error("renderWallShareCard failed", { formatId, error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError) });
      return NextResponse.json({ error: "render-failed" }, { status: 500 });
    }
  }

  // Not cached as aggressively as a single note's card: a wall's content
  // changes every time a new message is approved for this author, unlike
  // an individual note's permanent placement.
  image.headers.set("Cache-Control", "public, max-age=300, stale-while-revalidate=3600");
  return image;
}
