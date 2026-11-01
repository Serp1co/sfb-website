import type { JSX } from "react";
import Link from "next/link";
import { CONTACT_EMAIL, SERVICE_SLUGS, SERVICE_TECHNOLOGIES, type ServiceSlug } from "../data/site-data";
import { getDictionary } from "../i18n/get-dictionary";
import { LOCALES, fmt, homeHref, serviceHref, type Locale } from "../i18n/locales";
import SiteShell from "../layout/site-shell";
import Header from "../layout/header";
import Footer from "../layout/footer";
import { ArrowLeftIcon, MailIcon } from "../components/icons";

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
    <SiteShell>
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
        practices={practices}
      />

      <main id="main">
        <section className="detail-hero" aria-labelledby="detail-title">
          <div className="container section-head">
            <Link href={`${homeHref(locale)}#services`} className="text-link back-link">
              <ArrowLeftIcon />
              {dict.servicePage.allServices}
            </Link>
            <h1 id="detail-title" className="h1">
              {practice.title}
            </h1>
            <p className="lead">{practice.heroSubtitle}</p>
            <p className="copy">{practice.detailedDescription}</p>
          </div>
        </section>

        <section className="detail-block" aria-labelledby="deliver-title">
          <div className="container">
            <h2 id="deliver-title" className="h2 centered">
              {dict.servicePage.deliverTitle}
            </h2>
            <ul className="feature-grid">
              {practice.features.map((feature) => (
                <li key={feature.title} className="glass glass-card glass-card-lift feature-card">
                  <h3 className="h3">{feature.title}</h3>
                  <p>{feature.description}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="detail-block" aria-labelledby="tech-title">
          <div className="container">
            <h2 id="tech-title" className="h2 centered">
              {dict.servicePage.techTitle}
            </h2>
            <ul className="pill-row">
              {SERVICE_TECHNOLOGIES[slug].map((tech) => (
                <li key={tech} className="glass glass-pill">
                  {tech}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="detail-block" aria-labelledby="cta-title">
          <div className="container">
            <div className="glass glass-card cta-card">
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

      <Footer tagline={dict.footer.tagline} newTab={dict.common.newTab} />
    </SiteShell>
  );
}
