/**
 * The physical fulfilment partner's storefront. Centralized so it's never
 * hardcoded into a component — override via DILEKKUTUM_URL if the
 * destination ever changes. No account/API connection exists between
 * MINDOT and DilekKutum; this is a plain external redirect, matched back
 * to a MINDOT order manually via the order number — see
 * features/memories/lib/identifiers.ts and "Physical gift & DilekKutum
 * flow" in CLAUDE.md.
 */
export const DILEKKUTUM_URL = process.env.DILEKKUTUM_URL || "https://dilekkutum.com/";
