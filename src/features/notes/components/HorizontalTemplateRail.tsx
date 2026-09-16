"use client";

import { useRef } from "react";
import Image from "next/image";
import { cn } from "@/lib/cn";
import { SportsTemplateCard } from "./SportsTemplateCard";
import type { NoteTemplate } from "../types";

interface HorizontalTemplateRailProps {
  templates: NoteTemplate[];
  value: string;
  onChange: (templateId: string) => void;
  /** Accessible name for this rail's own `role="radiogroup"` — one per visible category, so a screen reader announces which collection it's in (e.g. "Sports" vs "Special occasions"). */
  groupLabel: string;
  prevLabel: string;
  nextLabel: string;
  /** Builds a sports card's `aria-label` from its color keys — kept out of this component so it never needs its own `useLocale()` call; `TemplatePicker` (the one caller) already has the dictionary. */
  sportsAriaLabel: (template: NoteTemplate) => string;
  /** i18n audit: a standard/seasonal card's translated display name (`templateDisplayName()`) — replaces the raw, always-English `template.name` this used to read directly. Same "built by the caller, which already has the dictionary" shape as `sportsAriaLabel` above. */
  templateName: (template: NoteTemplate) => string;
}

/**
 * EPIC 039: one category's scrollable card collection — the "< kart kart
 * kart >" rail from this EPIC's brief. Natural touch/trackpad swipe comes
 * free from `overflow-x-auto`; a plain mouse wheel (which only ever
 * carries a vertical delta) is remapped to horizontal scroll in
 * `handleWheel` below, and the two arrow buttons give a discoverable
 * click target for exactly the same gesture. Deliberately no CSS scroll-
 * snap — natural momentum scroll reads better here than forced snapping
 * for a variable-width, small (≤20-card) collection, and this EPIC's own
 * brief says snap should be used "judiciously," not by default.
 *
 * Stays one `role="radiogroup"` scoped to *this* rail's visible templates
 * only (not every template across every category) — the WAI-ARIA APG
 * roving-tabindex pattern only makes sense over options a user can
 * currently see/reach; switching category swaps which rail (and which
 * radiogroup) is mounted, exactly like switching between two independent
 * option sets.
 */
export function HorizontalTemplateRail({
  templates,
  value,
  onChange,
  groupLabel,
  prevLabel,
  nextLabel,
  sportsAriaLabel,
  templateName,
}: HorizontalTemplateRailProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const selectedIndex = templates.findIndex((t) => t.id === value);

  function scrollByAmount(direction: 1 | -1) {
    const el = scrollRef.current;
    if (!el) return;
    // `behavior: "instant"`, not "smooth" — confirmed by real-browser
    // testing that `scrollBy`/`scrollTo` with `behavior: "smooth"` is a
    // silent no-op on this element (same root cause as the wheel handler's
    // own comment above); "instant" is the one behavior value verified to
    // reliably move the scroll position.
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: "instant" });
  }

  // A plain mouse wheel only ever reports a vertical delta — without this,
  // hovering the rail with a mouse (not a trackpad) would do nothing at
  // all, since the rail has no vertical overflow of its own. Only takes
  // over when the rail actually has horizontal overflow AND the gesture is
  // vertical-dominant (a trackpad's native horizontal `deltaX` swipe is
  // left untouched, and a rail with nothing to scroll never intercepts the
  // page's own vertical scroll).
  function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
    const el = scrollRef.current;
    if (!el) return;
    const hasOverflow = el.scrollWidth > el.clientWidth;
    if (!hasOverflow) return;
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    event.preventDefault();
    // `scrollBy`, not a direct `el.scrollLeft +=` assignment — confirmed by
    // real-browser testing that a direct property write is silently a
    // no-op on this element (it has `scroll-behavior: smooth` from the
    // inline style below); `scrollBy` respects that same property
    // correctly. `behavior: "instant"` here (not "smooth") so each wheel
    // tick tracks the input 1:1 rather than queuing a visible catch-up
    // animation behind fast scrolling.
    el.scrollBy({ left: event.deltaY, behavior: "instant" });
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (selectedIndex + 1 + templates.length) % templates.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (selectedIndex - 1 + templates.length) % templates.length;
    }
    if (nextIndex === null) return;
    event.preventDefault();
    onChange(templates[nextIndex].id);
    const nextButton = buttonRefs.current[nextIndex];
    nextButton?.focus();
    nextButton?.scrollIntoView({ behavior: "instant", inline: "center", block: "nearest" });
  }

  return (
    <div className="flex min-w-0 items-center gap-1">
      <button
        type="button"
        aria-label={prevLabel}
        onClick={() => scrollByAmount(-1)}
        className="hidden shrink-0 items-center justify-center rounded-full border border-border bg-surface p-1.5 text-ink-soft transition-colors hover:border-navy/40 hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange sm:flex"
      >
        <ChevronIcon direction="left" />
      </button>

      <div
        ref={scrollRef}
        role="radiogroup"
        aria-label={groupLabel}
        tabIndex={-1}
        onWheel={handleWheel}
        onKeyDown={handleKeyDown}
        className="flex min-w-0 flex-1 gap-3 overflow-x-auto py-1"
        // No `scrollBehavior: "smooth"` here (deliberately) — confirmed by
        // real-browser testing that it makes `scrollBy`/`scrollTo` calls
        // silently no-op; every programmatic scroll below uses
        // `behavior: "instant"` explicitly instead, and native touch/
        // trackpad drag-scrolling is unaffected by this property either way.
        style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-x" }}
      >
        {templates.map((template, index) => {
          const selected = template.id === value;
          const isSports = template.category === "sports";
          // Roving tabindex: the selected option (if visible in this rail)
          // is the one Tab stop; if nothing selected here is visible, fall
          // back to the first card so the rail stays reachable at all.
          const tabIndex = selected ? 0 : selectedIndex === -1 && index === 0 ? 0 : -1;

          if (isSports) {
            return (
              <SportsTemplateCard
                key={template.id}
                template={template}
                selected={selected}
                ariaLabel={sportsAriaLabel(template)}
                tabIndex={tabIndex}
                onSelect={() => onChange(template.id)}
                buttonRef={(el) => {
                  buttonRefs.current[index] = el;
                }}
              />
            );
          }

          return (
            <button
              key={template.id}
              ref={(el) => {
                buttonRefs.current[index] = el;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={templateName(template)}
              tabIndex={tabIndex}
              onClick={() => onChange(template.id)}
              className="group/option relative w-32 shrink-0 rounded-lg p-1 transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
            >
              {/* Same mask-based selection glow as the picker used before
                  this EPIC — unchanged, just moved into this file. */}
              <span
                aria-hidden="true"
                className={cn(
                  "absolute -inset-1.5 bg-orange transition-opacity duration-[var(--motion-fast)]",
                  selected ? "opacity-100" : "opacity-0 group-hover/option:opacity-40"
                )}
                style={{
                  WebkitMaskImage: `url(${template.image})`,
                  maskImage: `url(${template.image})`,
                  WebkitMaskSize: "contain",
                  maskSize: "contain",
                  WebkitMaskRepeat: "no-repeat",
                  maskRepeat: "no-repeat",
                  WebkitMaskPosition: "center",
                  maskPosition: "center",
                }}
              />
              <Image
                src={template.image!}
                alt=""
                width={template.imageWidth!}
                height={template.imageHeight!}
                className="relative h-auto w-full object-contain"
              />
            </button>
          );
        })}
      </div>

      <button
        type="button"
        aria-label={nextLabel}
        onClick={() => scrollByAmount(1)}
        className="hidden shrink-0 items-center justify-center rounded-full border border-border bg-surface p-1.5 text-ink-soft transition-colors hover:border-navy/40 hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange sm:flex"
      >
        <ChevronIcon direction="right" />
      </button>
    </div>
  );
}

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="h-4 w-4 fill-none stroke-current"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={direction === "left" ? "M10 3 5 8l5 5" : "M6 3l5 5-5 5"} />
    </svg>
  );
}
