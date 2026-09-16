/**
 * The physical fulfilment partner's storefront. Centralized so it's never
 * hardcoded into a component — override via DILEKKUTUM_URL if the
 * destination ever changes. No account/API connection exists between
 * MINDOT and DilekKutum; this is a plain external redirect, matched back
 * to a MINDOT order manually via the order number — see
 * features/memories/lib/identifiers.ts and "Physical gift & DilekKutum
 * flow" in CLAUDE.md.
 *
 * EPIC 053: defaults to `null` (same fail-safe shape as
 * `shoppier.ts`'s `SHOPPIER_PRODUCT_URL`) rather than the real live
 * storefront — the pre-launch commercial phase isn't active yet, so an
 * unset env var must never silently hand a real user a live external
 * purchase link. Set DILEKKUTUM_URL once the physical-gift flow is
 * actually ready to go live.
 */
export const DILEKKUTUM_URL = process.env.DILEKKUTUM_URL || null;
