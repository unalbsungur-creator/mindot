"use client";

import { useMemo, useRef } from "react";
import { cn } from "@/lib/cn";
import { getActiveNoteTemplates } from "../config/templates";
import type { NoteData } from "../types";
import { Note } from "./Note";

interface TemplatePickerProps {
  value: string;
  onChange: (templateId: string) => void;
  /** Accessible group label — e.g. dictionary.write.templateLabel. */
  label: string;
}

/**
 * A visual style picker built entirely from the real `Note` component —
 * no separate mock/approximation of what a template looks like. Each
 * option is one small, real note (its own paper/shape/attachment), so
 * "browsing styles" and "seeing the actual style" are the same thing.
 */
export function TemplatePicker({ value, onChange, label }: TemplatePickerProps) {
  const templates = useMemo(() => getActiveNoteTemplates(), []);
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

  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-3" onKeyDown={handleKeyDown}>
      {templates.map((template, index) => {
        const selected = template.id === value;
        const previewNote: NoteData = {
          id: `template-preview-${template.id}`,
          content: "Aa",
          authorName: template.name,
          templateId: template.id,
          size: "sm",
          rotation: 0,
          position: { top: "0%", left: "0%" },
        };

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
            className={cn(
              "rounded-lg p-1 transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange",
              selected ? "ring-2 ring-orange" : "ring-1 ring-transparent hover:ring-border"
            )}
          >
            <Note note={previewNote} variant="static" />
          </button>
        );
      })}
    </div>
  );
}
