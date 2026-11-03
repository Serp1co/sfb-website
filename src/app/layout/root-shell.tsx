import type { JSX, ReactNode } from "react";
import type { Locale } from "../i18n/locales";
import ExperienceRoot from "../motion/experience-root";
import { fontSans } from "./fonts";
import "../globals.css";
import "../styles/components.css";
import "../styles/sections.css";

/**
 * Shared <html>/<body> for each language's root layout, so `lang` is correct
 * in the static HTML (screen readers, hyphenation, search).
 *
 * ExperienceRoot (the scene, smooth scroll, the glass registry) wraps every page of the
 * language, so it persists across client navigations.
 *
 * No data-scroll-behavior: the stylesheet sets no `scroll-behavior: smooth` (the motion runtime
 * passes the behaviour to each in-page scroll itself, and route changes jump instantly), so there
 * is nothing for Next 16 to switch off during a navigation, and the attribute would only make it
 * force a layout at the start of every one.
 */
export default function RootShell({ locale, children }: { locale: Locale; children: ReactNode }): JSX.Element {
  return (
    <html lang={locale} className={fontSans.variable}>
      <body>
        <ExperienceRoot>{children}</ExperienceRoot>
      </body>
    </html>
  );
}
