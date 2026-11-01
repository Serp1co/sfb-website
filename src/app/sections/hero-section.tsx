import type { JSX } from "react";
import Image from "next/image";
import Link from "next/link";
import { CONTACT_EMAIL, SERVICE_SLUGS, SERVICE_TECHNOLOGIES } from "../data/site-data";
import type { Dictionary } from "../i18n/dictionaries/types";
import { serviceHref, type Locale } from "../i18n/locales";
import { ArrowRightIcon, MailIcon } from "../components/icons";

interface HeroSectionProps {
  locale: Locale;
  copy: Dictionary["hero"];
  servicesLabel: string;
  practices: Dictionary["practices"];
}

/** How many technologies each door names. */
const DOOR_TECH_COUNT = 3;

export default function HeroSection({ locale, copy, servicesLabel, practices }: HeroSectionProps): JSX.Element {
  return (
    <section id="hero" className="hero" aria-labelledby="hero-title">
      <div className="container hero-inner">
        {/* The reversed lockup: the original's charcoal "FB" measured 2.4:1 on this black. */}
        <Image className="hero-logo rise" src="/sfbs-logo-light.png" alt="" width={601} height={244} priority />

        <h1 id="hero-title" className="h1 rise">
          <span className="claim-lead">{copy.claimLead}</span>
          <span className="claim-emphasis">{copy.claimEmphasis}</span>
        </h1>
        <p className="lead rise">{copy.lead}</p>

        <div className="hero-actions rise">
          <a className="btn btn-primary" href={`mailto:${CONTACT_EMAIL}`}>
            <MailIcon />
            {copy.primaryCta}
          </a>
          <a className="btn" href="#services">
            {copy.secondaryCta}
          </a>
        </div>

        {/* A way in for each kind of visitor: straight to the practice, stack first. */}
        <nav className="doors rise" aria-label={servicesLabel}>
          <ul>
            {SERVICE_SLUGS.map((slug) => (
              <li key={slug}>
                <Link href={serviceHref(locale, slug)} className="door glass glass-card glass-card-lift">
                  <span className="door-title">{practices[slug].title}</span>
                  <span className="door-tech">
                    {SERVICE_TECHNOLOGIES[slug].slice(0, DOOR_TECH_COUNT).join(" · ")}
                  </span>
                  <ArrowRightIcon />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </section>
  );
}
