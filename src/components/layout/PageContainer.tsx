import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function PageContainer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    // Each gutter is max(the usual gutter, that side's safe-area inset): the
    // same 1rem/1.5rem/2.5rem as always wherever there's no inset (desktop,
    // portrait phones), and clear of the notch on a landscape phone.
    <div
      className={cn(
        "mx-auto w-full max-w-[1400px] pl-[max(1rem,var(--safe-left))] pr-[max(1rem,var(--safe-right))] sm:pl-[max(1.5rem,var(--safe-left))] sm:pr-[max(1.5rem,var(--safe-right))] lg:pl-[max(2.5rem,var(--safe-left))] lg:pr-[max(2.5rem,var(--safe-right))]",
        className
      )}
    >
      {children}
    </div>
  );
}
