import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type BadgeTone = "brand" | "onDark";

const toneClasses: Record<BadgeTone, string> = {
  brand: "border-orange/30 bg-orange-tint/60 text-orange-ink",
  // For a badge sitting directly on a dark navy background (the homepage
  // hero) — the default tone's tinted-orange fill reads as a light-surface
  // chip and disappears against navy.
  onDark: "border-orange/40 bg-transparent text-orange",
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export function Badge({ className, tone = "brand", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill border px-3 py-1 text-xs font-medium uppercase tracking-wide",
        toneClasses[tone],
        className
      )}
      {...props}
    />
  );
}
