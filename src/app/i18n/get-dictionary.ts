import type { Dictionary } from "./dictionaries/types";
import type { Locale } from "./locales";
import en from "./dictionaries/en";
import it from "./dictionaries/it";

const dictionaries: Record<Locale, Dictionary> = { en, it };

/**
 * Server-side only: import this from Server Components so the dictionaries
 * stay out of the client bundle. Pass strings down as props.
 */
export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}
