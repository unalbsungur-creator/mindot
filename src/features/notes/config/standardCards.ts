import type { NoteTemplate } from "../types";

/**
 * The redesigned image-backed Standard cards (every `standard-*` card after
 * "standard-classic") share one set of rules — see
 * docs/STANDARD_CARD_REDESIGN_BRIEF.md. `defineStandardCard` fills those
 * shared fields so a new card is registered by stating only what is really
 * its own: id, name, paper tone, the web derivative and its measured
 * `contentArea`.
 *
 * "standard-classic" deliberately does not use this: it predates the rules
 * and keeps the global 150-character limit.
 */

/** V1 message limit for the redesigned Standard cards (the global limit stays 150). */
export const STANDARD_CARD_MAX_CHARACTERS = 100;

/**
 * The text safe area the redesign brief asks the designer for, in
 * percentages of the visible card (transparent margin excluded). This is a
 * target to audit a new export against, never a default: each card's
 * `contentArea` is measured on its own web derivative and written out
 * explicitly. `preferred` is 80×72, `minimum` 80×70.
 */
export const STANDARD_CARD_SAFE_AREA = {
  preferred: { top: "14%", left: "10%", width: "80%", height: "72%" },
  minimum: { top: "15%", left: "10%", width: "80%", height: "70%" },
} as const;

export interface StandardCardDefinition {
  id: `standard-${string}`;
  /** English registry name; the localized one goes in `write.templateNames[id]`. */
  name: string;
  paper: NoteTemplate["paper"];
  /** Always the ~600px web derivative, never the designer's master in `public/images/standard/`. */
  image: `/images/standard/web/${string}.png`;
  imageWidth: number;
  imageHeight: number;
  /** Measured on `image` itself — see the comments on the existing cards in templates.ts. */
  contentArea: NonNullable<NoteTemplate["contentArea"]>;
}

export function defineStandardCard(card: StandardCardDefinition): NoteTemplate {
  return {
    id: card.id,
    name: card.name,
    paper: card.paper,
    shape: "sticky",
    attachment: "none",
    font: "sans",
    category: "standard",
    enabled: true,
    image: card.image,
    imageWidth: card.imageWidth,
    imageHeight: card.imageHeight,
    contentArea: card.contentArea,
    contentTextSize: "spacious",
    maxCharacters: STANDARD_CARD_MAX_CHARACTERS,
  };
}
