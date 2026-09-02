import { getPublicMessageById } from "@/features/board/repository";
import { getDictionary } from "@/i18n/translations";
import { OG_IMAGE_SIZE, renderBrandOgImage } from "@/features/sharing/services/brandOgImage";
import { sloganForLanguage, toShareCardNote } from "@/features/sharing/lib/shareCardData";
import { renderShareCard } from "@/features/sharing/services/shareCardRenderer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = "MINDOT";
export const size = OG_IMAGE_SIZE;
export const contentType = "image/png";

/**
 * The link-preview image for a single note's memory/share page. Reuses
 * `renderShareCard` (the same renderer the share flow uses) with the OG
 * convention's 1200x630 size — privacy-safe by construction, since it
 * only ever renders what `getPublicMessageById` returns. Falls back to
 * the generic brand image for an ineligible/missing message instead of
 * erroring, since a crawler hitting a stale/unshared link shouldn't see a
 * 500.
 */
export default async function Image({ params }: { params: Promise<{ messageId: string }> }) {
  const { messageId } = await params;
  const message = await getPublicMessageById(messageId);

  if (!message) {
    return renderBrandOgImage(getDictionary("en").boardPage.slogan);
  }

  return renderShareCard({
    primary: toShareCardNote(message),
    format: { id: "og", name: "OG", width: OG_IMAGE_SIZE.width, height: OG_IMAGE_SIZE.height },
    slogan: sloganForLanguage(message.language),
  });
}
