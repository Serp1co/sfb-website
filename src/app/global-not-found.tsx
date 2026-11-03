import type { Metadata } from "next";
import { ANCHORS } from "./glass/contract";
import { getDictionary } from "./i18n/get-dictionary";
import { DEFAULT_LOCALE } from "./i18n/locales";
import Footer from "./layout/footer";
import { fontSans } from "./layout/fonts";
import ExperienceRoot from "./motion/experience-root";
import "./globals.css";
import "./styles/components.css";
import "./styles/sections.css";

export const metadata: Metadata = {
  title: "404 | SFB S.R.L.",
};

/**
 * With one root layout per language there is no single layout to build the 404
 * from, so it brings its own <html>. It is bilingual for the same reason.
 * The live scene runs here too (ExperienceRoot): the page is one hero, and the
 * orb settles on its two actions, below the h1 (a copy anchor it keeps clear of).
 * The footer bar comes along for its pause control: the scene animates here as
 * on every page. The page's language is English, so the bar's strings are too.
 */
export default function GlobalNotFound() {
  const dict = getDictionary(DEFAULT_LOCALE);
  return (
    <html lang="en" className={fontSans.variable}>
      <body>
        <ExperienceRoot>
          <main id="main" className="hero" data-story="hero">
            <div className="container hero-inner">
              <h1 className="h1" data-anchor={ANCHORS.copy}>
                <span className="claim-lead">Page not found.</span>
                <span className="claim-emphasis" lang="it">
                  Pagina non trovata.
                </span>
              </h1>
              <div className="hero-actions" data-anchor={ANCHORS.heroActions}>
                <a className="btn btn-primary" href="/" data-glass="button" data-glass-tint="blue" data-magnetic="">
                  <span>Home</span>
                </a>
                <a className="btn" href="/it/" hrefLang="it" lang="it" data-glass="button" data-magnetic="">
                  <span>Home (italiano)</span>
                </a>
              </div>
            </div>
          </main>
          <Footer tagline={dict.footer.tagline} newTab={dict.common.newTab} motionLabels={dict.common.motion} />
        </ExperienceRoot>
      </body>
    </html>
  );
}
