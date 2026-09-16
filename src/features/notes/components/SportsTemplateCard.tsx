"use client";

import { footballBallBackground } from "../lib/sportsBall";
import type { NoteTemplate } from "../types";

interface SportsTemplateCardProps {
  template: NoteTemplate;
  selected: boolean;
  ariaLabel: string;
  tabIndex: number;
  onSelect: () => void;
  buttonRef: (el: HTMLButtonElement | null) => void;
}

/**
 * EPIC 039: one "Spor" category picker option — a round, two-tone
 * "football" swatch built purely from `template.primaryColor`/
 * `secondaryColor`/`accentColor` (see `lib/sportsBall.ts`), never a PNG
 * asset (the whole point of the sports category is a lightweight
 * CSS-only render — see CLAUDE.md's "Development seed data" performance
 * guidance in spirit: no heavy per-card images to load). Deliberately a
 * separate component from `TemplatePicker`'s PNG-image option renderer —
 * the two have nothing in common visually (no `<Image>`, no mask-based
 * selection glow) beyond both being one `role="radio"` option.
 *
 * No team name ever appears here — `ariaLabel` (built by the caller from
 * `dictionary.write.sportsCardAriaLabel` + `sportsColorNames`) is the only
 * accessible description, and there is no visible text on the card at all.
 */
export function SportsTemplateCard({ template, selected, ariaLabel, tabIndex, onSelect, buttonRef }: SportsTemplateCardProps) {
  return (
    <button
      ref={buttonRef}
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={ariaLabel}
      tabIndex={tabIndex}
      onClick={onSelect}
      className="group/option relative shrink-0 rounded-full p-1 transition-transform duration-[var(--motion-fast)] hover:scale-[1.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
    >
      {/* Selection ring — a plain circular glow behind the ball, matching
          the standard/occasion options' orange-glow selection language
          (see TemplatePicker.tsx) but circular instead of mask-shaped,
          since a football card has no PNG alpha channel to mask against. */}
      <span
        aria-hidden="true"
        className={`absolute -inset-1.5 rounded-full bg-orange transition-opacity duration-[var(--motion-fast)] ${
          selected ? "opacity-100" : "opacity-0 group-hover/option:opacity-40"
        }`}
      />
      <span
        aria-hidden="true"
        className="relative block aspect-square w-20 rounded-full shadow-card ring-1 ring-black/10"
        style={footballBallBackground(template.primaryColor!, template.secondaryColor!, template.accentColor)}
      />
    </button>
  );
}
