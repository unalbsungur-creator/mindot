import type { Locale } from "../config";
import type { Dictionary } from "./types";
import { en } from "./en";
import { tr } from "./tr";
import { de } from "./de";
import { fr } from "./fr";
import { es } from "./es";

export type { Dictionary } from "./types";

export const dictionaries: Record<Locale, Dictionary> = { en, tr, de, fr, es };

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale] ?? dictionaries.en;
}
