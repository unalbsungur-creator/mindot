/**
 * Plain hex mirror of src/styles/tokens.css — @react-pdf/renderer can't
 * read CSS custom properties or Tailwind's `@theme`, so these values are
 * necessarily duplicated here. If tokens.css's brand/paper colors change,
 * update this file to match.
 */
export const PDF_COLORS = {
  navy: "#0d1b2a",
  navySoft: "#1c324a",
  orange: "#ff6a00",
  orangeSoft: "#ff8c3d",
  // Added for the Memory Print share card's decoration icons (e.g. the
  // "florals" motif's center dot), which need it — every other value here
  // pre-dates that use and already mirrored tokens.css in full.
  orangeInk: "#9a4400",
  canvas: "#f3efe4",
  surface: "#fffdf8",
  ink: "#201d18",
  inkSoft: "#63594c",
  border: "#e2d9c6",
} as const;

export const PDF_PAPER_COLORS: Record<string, string> = {
  yellow: "#f7e08a",
  cream: "#f4ecd8",
  blue: "#cfe1e8",
  pink: "#f2d9d9",
  kraft: "#c9a877",
  white: "#fffdf9",
  mint: "#d3e6d6",
};
