import type { JSX } from "react";
import Link from "next/link";
import { CONTACT_EMAIL, SERVICE_SLUGS, SERVICE_TECHNOLOGIES, type ServiceSlug } from "../data/site-data";
import { ANCHORS } from "../glass/contract";
import { getDictionary } from "../i18n/get-dictionary";
import { LOCALES, fmt, homeHref, serviceHref, type Locale } from "../i18n/locales";
import Header from "../layout/header";
import Footer from "../layout/footer";
import { ArrowLeftIcon, MailIcon } from "../components/icons";

/**
 * A practice page. data-practice on <main> tells the scene which practice's body leads;
 * data-story on each section names its pose (see glass/contract.ts).
 *
 * Below the hero it behaves like the landing (owner, 2026-11-02, "choreography v3"): every feature
 * card and the call-to-action panel is a cell, so the orb splits into them, one body inside each,
 * and the scene runs circuitry between neighbouring cards. A cell lights up electric blue while its
 * body is inside (data-energized, set by the glass registry; the CSS glow is in
 * styles/components.css), and so does each technology pill, which holds a small droplet of its own
 * (v3.1). The grid centres a short last row (styles/sections.css), so the circuit ends centred.
 */
export default function ServicePage({ locale, slug }: { locale: Locale; slug: ServiceSlug }): JSX.Element {
  const dict = getDictionary(locale);
  const practice = dict.practices[slug];
  const lowerTitle = practice.title.toLowerCase();

  const hrefByLocale = Object.fromEntries(
    LOCALES.map((code) => [code, serviceHref(code, slug)]),
  ) as Record<Locale, string>;
  const practices = SERVICE_SLUGS.map((s) => ({
    slug: s,
    title: dict.practices[s].title,
    href: serviceHref(locale, s),
  }));
  const others = practices.filter((p) => p.slug !== slug);

  return (
    <>
      <a className="skip-link" href="#main">
        {dict.header.skipToContent}
      </a>
      <Header
        locale={locale}
        isHome={false}
        homeHref={homeHref(locale)}
        hrefByLocale={hrefByLocale}
        activeService={slug}
        email={CONTACT_EMAIL}
        labels={dict.header}
        motionLabels={dict.common.motion}
        practices={practices}
      />

      <main id="main" data-practice={slug}>
        <section className="detail-hero" data-story="practice-hero" aria-labelledby="detail-title">
          <div className="container">
            {/* The head hugs its text column, so the scene can park the orb clear of the copy. It
                keeps its own anchor name, which the scene also counts as bare-text copy. */}
            <div className="section-head" data-anchor={ANCHORS.practiceCopy}>
              <Link href={`${homeHref(locale)}#services`} className="text-link back-link" data-reveal="block">
                <ArrowLeftIcon />
                {dict.servicePage.allServices}
              </Link>
              <h1 id="detail-title" className="h1" data-reveal="lines">
                {practice.title}
              </h1>
              <p className="lead" data-reveal="lines">
                {practice.heroSubtitle}
              </p>
              <p className="copy">{practice.detailedDescription}</p>
            </div>
          </div>
        </section>

        <section className="detail-block" data-story="practice-features" aria-labelledby="deliver-title">
          <div className="container">
            {/* Bare text over the scene: the orb keeps clear of it and the scene darkens under it. */}
            <header className="section-head" data-anchor={ANCHORS.copy}>
              <h2 id="deliver-title" className="h2" data-reveal="lines">
                {dict.servicePage.deliverTitle}
              </h2>
            </header>
            {/* Each card is a cell (cell-practice): one body of the orb inside it. */}
            <ul className="feature-grid" data-reveal="items">
              {practice.features.map((feature) => (
                <li
                  key={feature.title}
                  className="glass glass-card glass-card-lift feature-card"
                  data-glass="card"
                  data-anchor={ANCHORS.practiceCell}
                >
                  <h3 className="h3">{feature.title}</h3>
                  <p>{feature.description}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="detail-block" data-story="practice-tech" aria-labelledby="tech-title">
          <div className="container">
            <header className="section-head" data-anchor={ANCHORS.copy}>
              <h2 id="tech-title" className="h2" data-reveal="lines">
                {dict.servicePage.techTitle}
              </h2>
            </header>
            {/* The pills' row (practice-tech): each pill holds a small droplet of the orb and lights
                up with it, and the pills are wired to each other, apart from the section's own
                circuitry (v3.1). Each pill is its own glass, so the scene finds each one. The
                droplet sits in the bead at the pill's leading end (v3.2): a clear window, so it
                reads as a ball rather than a glow behind the label, and the network's connector
                point sits there too. Decorative, so hidden from assistive technology. */}
            <ul className="pill-row" data-reveal="items" data-anchor={ANCHORS.practiceTech}>
              {SERVICE_TECHNOLOGIES[slug].map((tech) => (
                <li key={tech} className="glass glass-pill" data-glass="pill">
                  <span className="pill-bead" data-glass-window="" aria-hidden="true" />
                  {tech}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="detail-block" data-story="practice-cta" aria-labelledby="cta-title">
          <div className="container">
            {/* A cell (cell-practice-cta): one body inside it, joined to the grid by circuitry. */}
            <div className="glass glass-card cta-card" data-glass="panel" data-anchor={ANCHORS.practiceCtaCell}>
              <h2 id="cta-title" className="h2">
                {fmt(dict.servicePage.ctaTitle, { practice: lowerTitle })}
              </h2>
              <p className="copy">{fmt(dict.servicePage.ctaBody, { practice: lowerTitle })}</p>
              <a className="btn-flat btn-flat-primary" href={`mailto:${CONTACT_EMAIL}`}>
                <MailIcon />
                {dict.servicePage.ctaButton}
              </a>
              <div className="other-practices">
                <h3 className="h3">{dict.servicePage.otherTitle}</h3>
                <ul>
                  {others.map((other) => (
                    <li key={other.slug}>
                      <Link href={other.href} className="text-link">
                        {other.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer tagline={dict.footer.tagline} newTab={dict.common.newTab} motionLabels={dict.common.motion} />
    </>
  );
}
