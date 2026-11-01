import type { JSX, ReactNode } from "react";
import type { Locale } from "../i18n/locales";
import { sora } from "./fonts";
import "../globals.css";
import "../styles/components.css";
import "../styles/sections.css";

/**
 * Shared <html>/<body> for each language's root layout, so `lang` is correct
 * in the static HTML (screen readers, hyphenation, search).
 */
export default function RootShell({ locale, children }: { locale: Locale; children: ReactNode }): JSX.Element {
  return (
    <html lang={locale} className={sora.variable}>
      <body>{children}</body>
    </html>
  );
}
