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
 * The link-preview image for `/share/[messageId]` itself — added for
 * EPIC: Professional social share actions, whose Facebook button (see
 * SocialShareActions.tsx) opens `sharer.php?u=<this page>`, which reads
 * *this route's* Open Graph tags, not the generic homepage image the page
 * had no per-note preview for until now. Exact same shape as the sibling
 * `/memory/[messageId]/opengraph-image.tsx`: reuses `renderShareCard`,
 * privacy-safe by construction (`getPublicMessageById` only), falls back
 * to the generic brand image for a missing/ineligible message.
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
