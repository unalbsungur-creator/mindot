import type { Dictionary } from "@/i18n/translations";
import type { NoteTemplate } from "../types";

/**
 * i18n audit: the one place a template's own display name — never the full
 * `sportsCardAriaLabel` sentence, and never `template.name` directly — is
 * resolved for UI outside the picker itself (moderation queue, private
 * archive). A sports/football template's name is composed from
 * `sportsCardNamePrefix` + `sportsColorNames` (the same color vocabulary
 * `sportsCardAriaLabel` already uses), never a second, separately-
 * translated "Football — X & Y" string per template. Every other template
 * looks up `write.templateNames[template.id]`, falling back to the
 * registry's own English `name` if a newer template hasn't been added to
 * the dictionary yet — so registering a template in `config/templates.ts`
 * never requires a synchronized 5-locale dictionary update before it can
 * ship.
 */
export function templateDisplayName(template: NoteTemplate, dictionary: Dictionary): string {
  const t = dictionary.write;
  if (template.category === "sports" && template.primaryColor && template.secondaryColor) {
    const names = t.sportsColorNames;
    const primary = names[template.primaryColor];
    const secondary = names[template.secondaryColor];
    const accent = template.accentColor ? names[template.accentColor] : null;
    return accent
      ? `${t.sportsCardNamePrefix} — ${primary}, ${secondary} & ${accent}`
      : `${t.sportsCardNamePrefix} — ${primary} & ${secondary}`;
  }
  return t.templateNames[template.id] ?? template.name;
}
