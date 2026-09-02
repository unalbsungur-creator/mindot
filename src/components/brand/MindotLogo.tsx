import { cn } from "@/lib/cn";
import { BrandMark, type BrandMarkTone } from "./BrandMark";

export type MindotLogoLayout = "horizontal" | "vertical" | "symbol" | "logotype";
export type MindotLogoTone = BrandMarkTone;

interface MindotLogoProps {
  layout?: MindotLogoLayout;
  tone?: MindotLogoTone;
  className?: string;
}

const wordmarkToneClasses: Record<MindotLogoTone, string> = {
  brand: "text-navy",
  inverted: "text-white",
  onOrange: "text-white",
  mono: "text-current",
};

const dAccentClasses: Record<MindotLogoTone, string> = {
  brand: "text-orange",
  inverted: "text-orange",
  onOrange: "text-navy",
  mono: "text-current",
};

function Wordmark({ tone, className }: { tone: MindotLogoTone; className?: string }) {
  return (
    <span className={cn("font-semibold tracking-tight", wordmarkToneClasses[tone], className)}>
      MIN<span className={dAccentClasses[tone]}>D</span>OT
    </span>
  );
}

export function MindotLogo({ layout = "horizontal", tone = "brand", className }: MindotLogoProps) {
  if (layout === "symbol") {
    return <BrandMark tone={tone} className={cn("h-8 w-8", className)} />;
  }

  if (layout === "logotype") {
    return <Wordmark tone={tone} className={cn("text-xl", className)} />;
  }

  if (layout === "vertical") {
    return (
      <span className={cn("inline-flex flex-col items-center gap-2", className)}>
        <BrandMark tone={tone} className="h-10 w-10" />
        <Wordmark tone={tone} className="text-xl" />
      </span>
    );
  }

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <BrandMark tone={tone} className="h-8 w-8" />
      <Wordmark tone={tone} className="text-xl" />
    </span>
  );
}
