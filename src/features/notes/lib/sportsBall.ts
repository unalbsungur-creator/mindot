import type { CSSProperties } from "react";
import type { SportsColorKey } from "../types";

/**
 * EPIC 039: one representative hex per `SportsColorKey` — approximate,
 * MINDOT-chosen shades (not an attempt at any club's exact official hex),
 * since these cards represent a color combination, not a licensed team
 * identity. Shared by every sports-ball renderer so a given key always
 * paints the same color everywhere it appears.
 */
export const SPORTS_COLOR_HEX: Record<SportsColorKey, string> = {
  yellow: "#F5C518",
  red: "#D8323C",
  navy: "#122B54",
  black: "#1B1B1F",
  white: "#F5F1E8",
  green: "#2E7D4F",
  maroon: "#6E1F35",
  blue: "#2C6FBB",
  orange: "#E4772E",
  purple: "#5B3A8E",
};

/**
 * A tasteful, deliberately non-literal "football" surface — a small conic
 * wedge count (5, echoing a pentagon panel without drawing one) alternating
 * `primary`/`secondary` (and `accent` as a third wedge color when present),
 * under a soft top-left highlight for gentle dimension. No gloss/3D bevel
 * (explicitly out of scope — see EPIC 039's brief): the highlight is a
 * single low-opacity white radial layer, nothing else.
 *
 * Returned as inline `CSSProperties.background` (a `background` shorthand
 * with two comma-separated layers) rather than Tailwind classes — this
 * value is only ever generated from data (template colors), never a fixed
 * utility name a Tailwind JIT scan could discover, so it could never
 * compile into the stylesheet the way a class-based approach would need.
 */
export function footballBallBackground(
  primary: SportsColorKey,
  secondary: SportsColorKey,
  accent?: SportsColorKey
): CSSProperties {
  const p = SPORTS_COLOR_HEX[primary];
  const s = SPORTS_COLOR_HEX[secondary];
  const a = accent ? SPORTS_COLOR_HEX[accent] : undefined;

  const wedgeColors = a ? [p, s, a, p, s] : [p, s, p, s, p];
  const step = 360 / wedgeColors.length;
  const stops = wedgeColors
    .map((color, index) => `${color} ${(index * step).toFixed(2)}deg ${((index + 1) * step).toFixed(2)}deg`)
    .join(", ");

  return {
    background: `radial-gradient(circle at 32% 28%, rgba(255,255,255,0.22), rgba(255,255,255,0) 45%), conic-gradient(from 0deg, ${stops})`,
  };
}
