export type FrameCategory = "minimal" | "classic" | "gallery" | "memory" | "premium";
export type FrameOrientation = "portrait" | "landscape";
export type FrameLogoPlacement = "corner" | "footer" | "none";

/**
 * A frame template is a reusable output style for the digital/physical
 * memory products — the same registry philosophy as
 * features/notes/config/templates.ts. Adding a future frame means adding
 * an entry here and, only if the layout is structurally new, a branch in
 * the renderer (features/memories/services/renderer.tsx) — never a new
 * one-off page or component per frame.
 */
export interface FrameTemplate {
  id: string;
  name: string;
  category: FrameCategory;
  orientation: FrameOrientation;
  /** Hex — kept as plain values here since the PDF renderer can't read Tailwind/CSS tokens. */
  background: string;
  ink: string;
  accent: string;
  logoPlacement: FrameLogoPlacement;
  enabled?: boolean;
}

export const frameTemplates: FrameTemplate[] = [
  {
    id: "minimal-navy",
    name: "Minimal Navy",
    category: "minimal",
    orientation: "portrait",
    background: "#0D1B2A",
    ink: "#F3EFE4",
    accent: "#FF6A00",
    logoPlacement: "footer",
  },
  {
    id: "classic-paper",
    name: "Classic Paper",
    category: "classic",
    orientation: "portrait",
    background: "#F4ECD8",
    ink: "#201D18",
    accent: "#FF6A00",
    logoPlacement: "corner",
  },
  {
    id: "gallery-white",
    name: "Gallery White",
    category: "gallery",
    orientation: "landscape",
    background: "#FFFDF9",
    ink: "#0D1B2A",
    accent: "#FF6A00",
    logoPlacement: "corner",
  },
  {
    id: "memory-orange",
    name: "Memory Orange",
    category: "memory",
    orientation: "portrait",
    background: "#FF6A00",
    ink: "#FFFDF9",
    accent: "#0D1B2A",
    logoPlacement: "footer",
  },
  {
    id: "premium-edition",
    name: "Premium Edition",
    category: "premium",
    orientation: "portrait",
    background: "#0D1B2A",
    ink: "#F3EFE4",
    accent: "#FF6A00",
    logoPlacement: "corner",
  },
];

export function getFrameTemplate(id: string): FrameTemplate {
  return frameTemplates.find((template) => template.id === id) ?? frameTemplates[0];
}

export function getActiveFrameTemplates(): FrameTemplate[] {
  return frameTemplates.filter((template) => template.enabled !== false);
}
