"use client";

import { useMemo, useRef } from "react";
import Image from "next/image";
import { cn } from "@/lib/cn";
import { getActiveNoteTemplates } from "../config/templates";

interface TemplatePickerProps {
  value: string;
  onChange: (templateId: string) => void;
  /** Accessible group label — e.g. dictionary.write.templateLabel. */
  label: string;
  /**
   * EPIC: Özel Günler İçin Tercih Edilebilir Post-it Tasarımları. Visual
   * section headings splitting the (single, still keyboard-flat) radiogroup
   * into "Standard" and "Special occasions" — optional so any other caller
   * of this component keeps working unchanged with one ungrouped list.
   */
  standardLabel?: string;
  occasionLabel?: string;
}

/**
 * EPIC: Özel ve Standart Post-it Görsellerini Gerçek PNG Dosyalarıyla
 * Değiştir. Each option renders the template's real designed artwork
 * (`template.image`, from `public/images/postits/`) directly — not the
 * general-purpose `Note` component's CSS paper/shape approximation. This
 * is correct specifically *because* this picker's preview content is
 * always the same fixed "Aa" / "— <template name>" placeholder, which the
 * artwork already has baked in; a real note's actual (variable) content
 * and author still render through `Note`'s CSS system everywhere else
 * (board, live write-flow preview, PDF, share cards) — those can never be
 * baked into a static image.
 *
 * Templates render in two visually-labeled sections (standard vs. special
 * occasions, split on `template.category`) when `standardLabel`/
 * `occasionLabel` are supplied — but stay one single `role="radiogroup"`
 * with one flat, index-based keyboard nav order (standard first, then
 * occasions) rather than two separate groups, since the user is always
 * choosing exactly one design across both sections.
 */
export function TemplatePicker({ value, onChange, label, standardLabel, occasionLabel }: TemplatePickerProps) {
  const templates = useMemo(() => getActiveNoteTemplates(), []);
  const standardTemplates = useMemo(() => templates.filter((t) => t.category !== "seasonal"), [templates]);
  const occasionTemplates = useMemo(() => templates.filter((t) => t.category === "seasonal"), [templates]);
  const showGroups = standardLabel !== undefined && occasionLabel !== undefined && occasionTemplates.length > 0;
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // WAI-ARIA APG radiogroup pattern: arrow keys move focus AND selection
  // between options (Tab only enters/leaves the group once) — plain Tab-
  // between-buttons behavior alone under a native `role="radiogroup"`
  // doesn't match what assistive tech expects from a radio group.
  function handleKeyDown(event: React.KeyboardEvent) {
    const currentIndex = templates.findIndex((t) => t.id === value);
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1 + templates.length) % templates.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (currentIndex - 1 + templates.length) % templates.length;
    }
    if (nextIndex === null) return;
    event.preventDefault();
    onChange(templates[nextIndex].id);
    buttonRefs.current[nextIndex]?.focus();
  }

  function renderOption(template: (typeof templates)[number]) {
    const index = templates.indexOf(template);
    const selected = template.id === value;

    return (
      <button
        key={template.id}
        ref={(el) => {
          buttonRefs.current[index] = el;
        }}
        type="button"
        role="radio"
        aria-checked={selected}
        aria-label={template.name}
        // Roving tabindex (WAI-ARIA APG radiogroup pattern): only the
        // selected option sits in the Tab order — Tab enters/leaves
        // the group in one step, arrow keys move within it.
        tabIndex={selected ? 0 : -1}
        onClick={() => onChange(template.id)}
        className="group/option relative w-32 rounded-lg p-1 transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
      >
        {/*
          Selection indicator that follows the artwork's own silhouette
          (heart, organic bloom, cut corners, ...) instead of a plain
          rectangle around it — achieved by using the SAME PNG as a CSS
          mask source (its alpha channel), not by re-authoring the shape.
          Sized slightly larger than the image and sat behind it so it
          reads as a glow/outline peeking past the artwork's edges.
        */}
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
          src={template.image}
          alt=""
          width={template.imageWidth}
          height={template.imageHeight}
          // Real designed artwork — never stretched/cropped/forced into a
          // square: intrinsic width/height above preserve the source
          // file's own ratio, object-contain guarantees no crop even if a
          // parent constraint ever disagrees with that ratio.
          className="relative h-auto w-full object-contain"
        />
      </button>
    );
  }

  if (!showGroups) {
    return (
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-3" onKeyDown={handleKeyDown}>
        {templates.map(renderOption)}
      </div>
    );
  }

  return (
    <div role="radiogroup" aria-label={label} className="flex flex-col gap-4" onKeyDown={handleKeyDown}>
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-soft">{standardLabel}</span>
        <div className="flex flex-wrap gap-3">{standardTemplates.map(renderOption)}</div>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-soft">{occasionLabel}</span>
        <div className="flex flex-wrap gap-3">{occasionTemplates.map(renderOption)}</div>
      </div>
    </div>
  );
}
