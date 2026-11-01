import type { JSX } from "react";
import { ADDRESS_LINES, CONTACT_EMAIL, GITHUB, LINKEDIN, VAT_NUMBER } from "../data/site-data";
import type { Dictionary } from "../i18n/dictionaries/types";
import CopyEmail from "../components/copy-email";
import { ArrowUpRightIcon, BuildingIcon, MailIcon, MapPinIcon } from "../components/icons";

interface ContactSectionProps {
  copy: Dictionary["contact"];
  newTab: string;
}

export default function ContactSection({ copy, newTab }: ContactSectionProps): JSX.Element {
  return (
    <section id="contact" className="section" aria-labelledby="contact-title">
      <div className="container">
        <header className="section-head">
          <h2 id="contact-title" className="h2">
            {copy.title}
          </h2>
          <p className="lead">{copy.lead}</p>
        </header>

        <div className="card-row">
          <article className="glass glass-card info-card">
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

          <article className="glass glass-card info-card">
            <MailIcon className="icon info-icon" />
            <h3 className="h3">{copy.emailLabel}</h3>
            <CopyEmail
              email={CONTACT_EMAIL}
              labels={{ copy: copy.copyCta, copied: copy.copied, failed: copy.copyFailed }}
            />
          </article>

          <article className="glass glass-card info-card">
            <BuildingIcon className="icon info-icon" />
            <h3 className="h3">{copy.businessLabel}</h3>
            <p>
              <span className="fact-line fact-muted">{copy.vatLabel}</span>
              <span className="fact-line">{VAT_NUMBER}</span>
            </p>
          </article>
        </div>

        <div className="contact-actions">
          <div className="btn-row">
            <a className="btn btn-primary" href={`mailto:${CONTACT_EMAIL}`}>
              <MailIcon />
              {copy.emailCta}
            </a>
            <a className="btn" href={LINKEDIN.link} target="_blank" rel="noopener noreferrer">
              {copy.linkedinCta}
              <ArrowUpRightIcon />
              <span className="sr-only"> ({newTab})</span>
            </a>
          </div>
          <a className="text-link" href={GITHUB.link} target="_blank" rel="noopener noreferrer">
            {copy.githubCta}
            <ArrowUpRightIcon />
            <span className="sr-only"> ({newTab})</span>
          </a>
        </div>
      </div>
    </section>
  );
}
