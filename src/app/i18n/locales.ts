/* ------------------------------------------------------------------ */
/*  Locales and URL scheme.                                           */
/*  English keeps the original URLs (/, /services/x/); Italian lives  */
/*  under /it. Static export has no server, so there is no redirect   */
/*  or negotiation: each language is its own set of static pages.     */
/* ------------------------------------------------------------------ */

export const LOCALES = ["en", "it"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/** Name of each language, written in that language. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  it: "Italiano",
};

export function localePrefix(locale: Locale): string {
  return locale === DEFAULT_LOCALE ? "" : `/${locale}`;
}

export function homeHref(locale: Locale): string {
  return locale === DEFAULT_LOCALE ? "/" : `/${locale}/`;
}

export function serviceHref(locale: Locale, slug: string): string {
  return `${localePrefix(locale)}/services/${slug}/`;
}

export function otherLocale(locale: Locale): Locale {
  return locale === "en" ? "it" : "en";
}

/** Replaces `{name}` placeholders so translators can reorder variables. */
export function fmt(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "");
}
