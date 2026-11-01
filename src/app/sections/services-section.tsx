import type { JSX } from "react";
import Image from "next/image";
import Link from "next/link";
import { LANDING_TECH_COUNT, SERVICE_IMAGES, SERVICE_SLUGS, SERVICE_TECHNOLOGIES } from "../data/site-data";
import type { Dictionary } from "../i18n/dictionaries/types";
import { fmt, serviceHref, type Locale } from "../i18n/locales";
import { ArrowRightIcon } from "../components/icons";

interface ServicesSectionProps {
  locale: Locale;
  copy: Dictionary["services"];
  practices: Dictionary["practices"];
}

export default function ServicesSection({ locale, copy, practices }: ServicesSectionProps): JSX.Element {
  return (
    <section id="services" className="section" aria-labelledby="services-title">
      <div className="container">
        <header className="section-head">
          <h2 id="services-title" className="h2">
            {copy.title}
          </h2>
          <p className="lead">{copy.lead}</p>
        </header>

        <ul className="card-row">
          {SERVICE_SLUGS.map((slug) => {
            const practice = practices[slug];
            return (
              <li key={slug} className="glass glass-card glass-card-lift service-card">
                <div className="service-image">
                  <Image
                    src={SERVICE_IMAGES[slug]}
                    alt=""
                    width={600}
                    height={500}
                    sizes="(max-width: 768px) 90vw, 380px"
                  />
                </div>
                <h3 className="practice-title">{practice.title}</h3>
                <p className="practice-summary">{practice.summary}</p>
                <ul className="tag-list tag-list-center">
                  {SERVICE_TECHNOLOGIES[slug].slice(0, LANDING_TECH_COUNT).map((tech) => (
                    <li key={tech} className="tag">
                      {tech}
                    </li>
                  ))}
                </ul>
                <Link href={serviceHref(locale, slug)} className="btn-flat">
                  {copy.learnMore}
                  <span className="sr-only"> {fmt(copy.learnMoreSr, { practice: practice.title })}</span>
                  <ArrowRightIcon />
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
