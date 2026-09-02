import { cn } from "@/lib/cn";

/**
 * The dotted D — MINDOT's primary symbol. MIN[D]OT shares its D between
 * "MIND" and "DOT": a thought (MIND) becomes a mark on the wall (DOT).
 * Drawn as a 5x7 dot matrix: the stem (left column) is orange, the bowl
 * (the curve) is navy, and one dot at the bowl's widest point — the point
 * where a thought lands — is a larger orange accent.
 */
export type DotVariant = "stem" | "bowl" | "landing";

// Exported so anything that can't render this DOM/SVG component directly —
// the PDF renderer, notably (react-pdf uses its own Svg primitives, not
// real DOM SVG) — can still draw the exact same mark from the same data.
export const DOTS: { x: number; y: number; variant: DotVariant }[] = [
  { x: 0, y: 0, variant: "stem" }, { x: 1, y: 0, variant: "bowl" }, { x: 2, y: 0, variant: "bowl" },
  { x: 0, y: 1, variant: "stem" }, { x: 3, y: 1, variant: "bowl" },
  { x: 0, y: 2, variant: "stem" }, { x: 4, y: 2, variant: "bowl" },
  { x: 0, y: 3, variant: "stem" }, { x: 4, y: 3, variant: "landing" },
  { x: 0, y: 4, variant: "stem" }, { x: 4, y: 4, variant: "bowl" },
  { x: 0, y: 5, variant: "stem" }, { x: 3, y: 5, variant: "bowl" },
  { x: 0, y: 6, variant: "stem" }, { x: 1, y: 6, variant: "bowl" }, { x: 2, y: 6, variant: "bowl" },
];

export const DOT_RADIUS = 0.62;

export type BrandMarkTone = "brand" | "inverted" | "onOrange" | "mono";

const dotClasses: Record<BrandMarkTone, Record<DotVariant, string>> = {
  brand: { stem: "fill-orange", bowl: "fill-navy", landing: "fill-orange" },
  inverted: { stem: "fill-orange", bowl: "fill-white", landing: "fill-orange" },
  onOrange: { stem: "fill-white", bowl: "fill-navy", landing: "fill-white" },
  mono: { stem: "fill-current", bowl: "fill-current opacity-60", landing: "fill-current" },
};

interface BrandMarkProps {
  className?: string;
  tone?: BrandMarkTone;
}

export function BrandMark({ className, tone = "brand" }: BrandMarkProps) {
  const classes = dotClasses[tone];

  return (
    <svg
      aria-hidden="true"
      viewBox="-0.9 -0.9 5.8 7.8"
      className={cn("aspect-[5.8/7.8] shrink-0", className)}
    >
      {DOTS.map((dot) => (
        <circle
          key={`${dot.x}-${dot.y}`}
          cx={dot.x}
          cy={dot.y}
          r={dot.variant === "landing" ? DOT_RADIUS * 1.35 : DOT_RADIUS}
          className={classes[dot.variant]}
        />
      ))}
    </svg>
  );
}
