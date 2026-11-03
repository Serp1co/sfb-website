import type { JSX } from "react";
import { ADDRESS_LINES, CONTACT_EMAIL, GITHUB, LINKEDIN, VAT_NUMBER } from "../data/site-data";
import { ANCHORS } from "../glass/contract";
import type { Dictionary } from "../i18n/dictionaries/types";
import CopyEmail from "../components/copy-email";
import { ArrowUpRightIcon, BuildingIcon, MailIcon, MapPinIcon } from "../components/icons";
import OrbSlot from "../components/orb-slot";

interface ContactSectionProps {
  copy: Dictionary["contact"];
  newTab: string;
}

/*
 * The two conversions are glass droplets that lean toward the cursor (data-magnetic). Their labels
 * sit in a span so the row's reveal can lift the content into each droplet without moving the
 * button itself, which the magnetic pull and the glass registry own. This section's slot, the gap
 * between the customers band and the head, is where the orb hands over from Partners; once the
 * info cards are in view it splits into three, one body inside each card (cell-contact), and a
 * card lights up electric blue while its body is inside (data-energized, set by the glass
 * registry). The head and the GitHub link are bare text over the scene (copy anchors), which the
 * bodies keep clear of.
 */
export default function ContactSection({ copy, newTab }: ContactSectionProps): JSX.Element {
  return (
    <section id="contact" className="section" data-story="contact" aria-labelledby="contact-title">
      <OrbSlot anchor={ANCHORS.orbSlotContact} />
      <div className="container">
        <header className="section-head" data-anchor={ANCHORS.copy}>
          <h2 id="contact-title" className="h2" data-reveal="lines">
            {copy.title}
          </h2>
          <p className="lead" data-reveal="lines">
            {copy.lead}
          </p>
        </header>

        <div className="card-row" data-reveal="items" data-anchor={ANCHORS.contactRow}>
          <article className="glass glass-card info-card" data-glass="card" data-anchor={ANCHORS.contactCell}>
            <MapPinIcon className="icon info-icon" />
            <h3 className="h3">{copy.addressLabel}</h3>
            <p>
              {ADDRESS_LINES.map((line) => (
                <span key={line} className="fact-line">
                  {line}
                </span>
              ))}
            </p>
          </article>

          <article className="glass glass-card info-card" data-glass="card" data-anchor={ANCHORS.contactCell}>
            <MailIcon className="icon info-icon" />
            <h3 className="h3">{copy.emailLabel}</h3>
            <CopyEmail
              email={CONTACT_EMAIL}
              labels={{ copy: copy.copyCta, copied: copy.copied, failed: copy.copyFailed }}
            />
          </article>

          <article className="glass glass-card info-card" data-glass="card" data-anchor={ANCHORS.contactCell}>
            <BuildingIcon className="icon info-icon" />
            <h3 className="h3">{copy.businessLabel}</h3>
            <p>
              <span className="fact-line fact-muted">{copy.vatLabel}</span>
              <span className="fact-line">{VAT_NUMBER}</span>
            </p>
          </article>
        </div>

        <div className="contact-actions">
          <div className="btn-row" data-reveal="items">
            <a
              className="btn btn-primary"
              href={`mailto:${CONTACT_EMAIL}`}
              data-glass="button"
              data-glass-tint="blue"
              data-magnetic=""
            >
              <MailIcon />
              <span>{copy.emailCta}</span>
            </a>
            <a
              className="btn"
              href={LINKEDIN.link}
              target="_blank"
              rel="noopener noreferrer"
              data-glass="button"
              data-magnetic=""
            >
              <span>{copy.linkedinCta}</span>
              <ArrowUpRightIcon />
              <span className="sr-only"> ({newTab})</span>
            </a>
          </div>
          <a
            className="text-link"
            href={GITHUB.link}
            target="_blank"
            rel="noopener noreferrer"
            data-anchor={ANCHORS.copy}
          >
            {copy.githubCta}
            <ArrowUpRightIcon />
            <span className="sr-only"> ({newTab})</span>
          </a>
        </div>
      </div>
    </section>
  );
}
