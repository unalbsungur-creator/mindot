"use client";

import { useMemo, useState } from "react";
import { useLocale } from "@/i18n/LocaleProvider";
import { getActiveNoteTemplates } from "../config/templates";
import { templateDisplayName } from "../lib/templateDisplayName";
import { HorizontalTemplateRail } from "./HorizontalTemplateRail";
import { TemplateCategoryNav, type TemplateCategoryFilter } from "./TemplateCategoryNav";
import type { NoteTemplate } from "../types";

interface TemplatePickerProps {
  value: string;
  onChange: (templateId: string) => void;
  /** Accessible group label for the picker as a whole — announced once, ahead of the category chips (the per-category radiogroup itself gets its own, more specific label — see HorizontalTemplateRail's `groupLabel`). */
  label: string;
}

function isStandard(template: NoteTemplate) {
  return template.category === undefined || template.category === "standard";
}

/**
 * EPIC 039: "Bir Nokta Bırak" Kart Seçimini Kategori + Yatay Kaydırmalı
 * Tasarıma Dönüştürme. Replaces the old single flat/grouped grid with a
 * category chip row (`TemplateCategoryNav`) plus one horizontally
 * scrollable card rail per category (`HorizontalTemplateRail`) — the
 * underlying selection is still one piece of state (`value`/`onChange`,
 * unchanged contract), and template ids/availability rules are completely
 * untouched (`getActiveNoteTemplates`, same as before this EPIC).
 *
 * "All" shows every active template in registration order (the pre-EPIC-039
 * flat list); "Standard"/"Special occasions"/"Sports" filter on
 * `NoteTemplate.category`. Switching category only swaps which rail is
 * mounted — never scrolls the page, never touches `value` itself.
 */
export function TemplatePicker({ value, onChange, label }: TemplatePickerProps) {
  const { dictionary } = useLocale();
  const t = dictionary.write;

  function templateName(template: NoteTemplate): string {
    return templateDisplayName(template, dictionary);
  }
  const templates = useMemo(() => getActiveNoteTemplates(), []);

  const standardTemplates = useMemo(() => templates.filter(isStandard), [templates]);
  const occasionTemplates = useMemo(() => templates.filter((tpl) => tpl.category === "seasonal"), [templates]);
  const sportsTemplates = useMemo(() => templates.filter((tpl) => tpl.category === "sports"), [templates]);

  // Defaults to whichever category the current selection actually belongs
  // to (so restoring a saved draft, or the initial default template, opens
  // on a rail that actually shows the selected card) rather than always
  // starting on "All".
  const [activeCategory, setActiveCategory] = useState<TemplateCategoryFilter>(() => {
    const current = templates.find((tpl) => tpl.id === value);
    if (!current) return "all";
    if (current.category === "seasonal") return "seasonal";
    if (current.category === "sports") return "sports";
    return "standard";
  });

  const categoryLabels: Record<TemplateCategoryFilter, string> = {
    all: t.templateCategoryAllLabel,
    standard: t.templateStandardLabel,
    seasonal: t.templateOccasionLabel,
    sports: t.templateCategorySportsLabel,
  };

  const visibleTemplates =
    activeCategory === "all"
      ? templates
      : activeCategory === "standard"
        ? standardTemplates
        : activeCategory === "seasonal"
          ? occasionTemplates
          : sportsTemplates;

  function sportsAriaLabel(template: NoteTemplate): string {
    const colorNames = t.sportsColorNames;
    const primary = template.primaryColor ? colorNames[template.primaryColor] : "";
    const secondary = template.secondaryColor ? colorNames[template.secondaryColor] : "";
    return t.sportsCardAriaLabel.replace("{primary}", primary).replace("{secondary}", secondary);
  }

  return (
    <div className="flex min-w-0 flex-col gap-3" aria-label={label}>
      <TemplateCategoryNav active={activeCategory} onChange={setActiveCategory} labels={categoryLabels} />
      <HorizontalTemplateRail
        // Remounts on category switch — without this, React reuses the
        // same scroll container across categories, so a rail scrolled
        // partway through a long category (e.g. "All") would carry that
        // same scroll offset into a shorter one, potentially opening on
        // blank space past its actual content.
        key={activeCategory}
        templates={visibleTemplates}
        value={value}
        onChange={onChange}
        groupLabel={`${label} — ${categoryLabels[activeCategory]}`}
        prevLabel={t.templateRailPrevLabel}
        nextLabel={t.templateRailNextLabel}
        sportsAriaLabel={sportsAriaLabel}
        templateName={templateName}
      />
    </div>
  );
}
