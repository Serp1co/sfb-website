import type { JSX } from "react";
import { CONTACT_EMAIL, SERVICE_SLUGS } from "../data/site-data";
import { getDictionary } from "../i18n/get-dictionary";
import { LOCALES, homeHref, serviceHref, type Locale } from "../i18n/locales";
import Header from "../layout/header";
import Footer from "../layout/footer";
import HeroSection from "../sections/hero-section";
import AboutSection from "../sections/about-section";
import ServicesSection from "../sections/services-section";
import PartnersSection from "../sections/partners-section";
import ContactSection from "../sections/contact-section";

/**
 * The scene, smooth scroll and the glass registry live in the root layout (ExperienceRoot,
 * via RootShell), so they persist across client navigations; a page only renders its content.
 * Each section names the scene pose it asks for with data-story (see glass/contract.ts).
 */
export default function HomePage({ locale }: { locale: Locale }): JSX.Element {
  const dict = getDictionary(locale);

  const hrefByLocale = Object.fromEntries(LOCALES.map((code) => [code, homeHref(code)])) as Record<Locale, string>;
  const practices = SERVICE_SLUGS.map((slug) => ({
    slug,
    title: dict.practices[slug].title,
    href: serviceHref(locale, slug),
  }));

  return (
    <>
      <a className="skip-link" href="#main">
        {dict.header.skipToContent}
      </a>
      <Header
        locale={locale}
        isHome
        homeHref={homeHref(locale)}
        hrefByLocale={hrefByLocale}
        email={CONTACT_EMAIL}
        labels={dict.header}
        motionLabels={dict.common.motion}
        practices={practices}
      />
      <main id="main">
        <HeroSection copy={dict.hero} />
        <AboutSection copy={dict.about} />
        <ServicesSection locale={locale} copy={dict.services} practices={dict.practices} />
        <PartnersSection copy={dict.partners} />
        <ContactSection copy={dict.contact} newTab={dict.common.newTab} />
      </main>
      <Footer tagline={dict.footer.tagline} newTab={dict.common.newTab} motionLabels={dict.common.motion} />
    </>
  );
}
