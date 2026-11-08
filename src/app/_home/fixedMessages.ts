/**
 * The homepage's pinned cards — shown in the hero composition independent
 * of like counts, first, before the cards the selection rule picks (see
 * heroSelection.ts). Real, already-approved database rows only; never
 * invented content.
 *
 * MB-01: one card — "Merhaba Dünya" (approved, anonymous; confirmed on the
 * public board, tile 1,0). It takes the first of the four places. The two
 * cards pinned before ("Kalite asla tesadüf değildir." — the board's
 * reference message — and "Aklımda kalmasın…") are no longer pinned; they
 * can still appear through the rule like any other card.
 *
 * A pinned card that is no longer approved (archived, rejected) or no
 * longer exists is skipped — its place is filled by the rule, never left
 * broken (`selectHomeHeroMessages`).
 */
export const HOME_FIXED_MESSAGE_IDS: readonly string[] = ["287bddad-ce94-4eca-8127-4f0d95776434"];
