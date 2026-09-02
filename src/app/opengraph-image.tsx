import { getDictionary } from "@/i18n/translations";
import { OG_IMAGE_SIZE, renderBrandOgImage } from "@/features/sharing/services/brandOgImage";

export const runtime = "nodejs";
export const alt = "MINDOT";
export const size = OG_IMAGE_SIZE;
export const contentType = "image/png";

export default function Image() {
  return renderBrandOgImage(getDictionary("en").boardPage.slogan);
}
