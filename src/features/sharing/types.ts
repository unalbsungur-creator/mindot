export type ShareSubjectType = "note" | "memory";

/**
 * A share format is a reusable output size — the same registry philosophy
 * as `noteTemplates`/`frameTemplates`. Square and Story are the only two
 * for now (per the brief's explicit priority); add a format by adding an
 * entry, not by writing a new renderer.
 */
export interface ShareFormat {
  id: string;
  name: string;
  width: number;
  height: number;
}
