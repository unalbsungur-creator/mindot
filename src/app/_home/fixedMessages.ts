import { BOARD_REFERENCE_MESSAGE_ID } from "@/features/board/lib/worldGeometry";

/**
 * EPIC: Ana Sayfadaki 4 Mesajın Yeni Yapısı — the two messages that always
 * appear in the hero composition, independent of like counts. Both are
 * real, already-approved database rows (confirmed by direct query before
 * writing this) — never invented content, never a duplicate.
 *
 *   1. "Kalite asla tesadüf değildir." — reuses the board's own canonical
 *      reference message id (see features/board/lib/worldGeometry.ts)
 *      rather than a second constant for the same message, per that
 *      EPIC's own note that this message "can keep its existing central
 *      reference role."
 *   2. "Aklımda kalmasın..." (id 54a52c75-5d5e-40ba-80c9-a3e127f59644),
 *      approved, anonymous. The EPIC that requested this quoted the text
 *      as "Aklında kalmasın..." — the real database record's spelling is
 *      "Aklımda" (verified directly against the live table); this id
 *      points at that real row, not a newly created one.
 *
 * app/page.tsx resolves these to actual `Message` rows at render time and
 * only treats a given id as "fixed" if that row is still `status =
 * "approved"` — if one has since been archived, its slot is filled by the
 * same top-liked fallback the two dynamic slots already use (see
 * getHomeHeroNotes there), never left broken.
 */
export const HOME_FIXED_MESSAGE_IDS = [
  BOARD_REFERENCE_MESSAGE_ID,
  "54a52c75-5d5e-40ba-80c9-a3e127f59644",
] as const;
