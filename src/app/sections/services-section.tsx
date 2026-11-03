import type { JSX } from "react";
import Image from "next/image";
import Link from "next/link";
import { SERVICE_IMAGES, SERVICE_SLUGS } from "../data/site-data";
import { ANCHORS } from "../glass/contract";
import type { Dictionary } from "../i18n/dictionaries/types";
import { fmt, serviceHref, type Locale } from "../i18n/locales";
import { ArrowRightIcon } from "../components/icons";

interface ServicesSectionProps {
  locale: Locale;
  copy: Dictionary["services"];
  practices: Dictionary["practices"];
}

/*
 * Each card's image frame is a clear window in its glass and the anchor the scene parks that
 * practice's body behind: here the orb splits into three, one per card, each body reflecting its
 * practice's photo. With the WebGL glass on, the stock photo fades out and the live body is the
 * illustration; with CSS glass it stays. The cards themselves are cells too (service-card): the
 * scene links them with circuitry, and a card lights up electric blue while its body is inside
 * (data-energized, set by the glass registry).
 *
 * Each card stands in a cell of its own (v3.3): with CSS glass the card's frost is a layer under
 * it with the window cut out, so the body reads through a clear window rather than a blur, and
 * the cell is what that layer needs: the width the window's height is worked out from, the stack
 * it paints in under the whole card, and the hover lift, which on the card itself would put the
 * layer over the card's edge (styles/components.css).
 */
export default function ServicesSection({ locale, copy, practices }: ServicesSectionProps): JSX.Element {
  return (
    <section id="services" className="section" data-story="services" aria-labelledby="services-title">
      <div className="container">
        <header className="section-head" data-anchor={ANCHORS.copy}>
          <h2 id="services-title" className="h2" data-reveal="lines">
            {copy.title}
          </h2>
          <p className="lead" data-reveal="lines">
            {copy.lead}
          </p>
        </header>

        <ul className="card-row" data-reveal="items">
          {SERVICE_SLUGS.map((slug) => {
            const practice = practices[slug];
            return (
              <li key={slug} className="service-cell">
                <div className="glass glass-card service-card" data-glass="card" data-anchor={ANCHORS.serviceCard}>
                  <div className="service-image" data-glass-window="" data-anchor={ANCHORS.practice(slug)}>
                    <Image
                      src={SERVICE_IMAGES[slug]}
                      alt=""
                      width={600}
                      height={500}
                      sizes="(max-width: 768px) 90vw, 380px"
                    />
                  </div>
                  <h3 className="practice-title">{practice.title}</h3>
                  {/* The technology list lives on each practice page (its pills); here one summary
                      per practice, written to the same shape and length so the three cards match. */}
                  <p className="practice-summary">{practice.summary}</p>
                  <Link href={serviceHref(locale, slug)} className="btn-flat">
                    {copy.learnMore}
                    <span className="sr-only"> {fmt(copy.learnMoreSr, { practice: practice.title })}</span>
                    <ArrowRightIcon />
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
