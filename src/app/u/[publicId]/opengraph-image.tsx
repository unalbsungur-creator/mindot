import { getPublicWall } from "@/features/profile/repository";
import { curateWallSelection } from "@/features/profile/lib/curateWallSelection";
import { getDictionary } from "@/i18n/translations";
import { OG_IMAGE_SIZE, renderBrandOgImage } from "@/features/sharing/services/brandOgImage";
import { renderWallShareCard } from "@/features/sharing/services/shareCardRenderer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = "MINDOT";
export const size = OG_IMAGE_SIZE;
export const contentType = "image/png";

/**
 * The link-preview image for a personal wall. Privacy-safe by
 * construction — only ever built from `getPublicWall`, so it can never
 * show an anonymous note or anyone's private archive, and never even
 * queries messages for a disabled wall (see getPublicWall). Falls back to
 * the generic brand image for an unknown publicId, a disabled wall, or an
 * enabled-but-empty one alike — same "never 500 a crawler, never leak a
 * private wall's identity into a link preview" rule as
 * /memory/[messageId]/opengraph-image.tsx.
 */
export default async function Image({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const wall = await getPublicWall(publicId);

  if (wall.status !== "ok" || wall.notes.length === 0) {
    return renderBrandOgImage(getDictionary("en").boardPage.slogan);
  }

  const curated = curateWallSelection(wall.notes, 4);

  return renderWallShareCard({
    displayName: wall.profile.displayName,
    notes: curated.map((note) => ({ content: note.content, templateId: note.templateId })),
    format: { id: "og", name: "OG", width: OG_IMAGE_SIZE.width, height: OG_IMAGE_SIZE.height },
    slogan: getDictionary("en").boardPage.slogan,
  });
}
