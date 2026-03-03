"use client";

import { JSX } from "react";
import { GlassButton } from "../components/glassism/glass-button";
import ContactSectionList from "../components/contact-section/contact-section-list";
import { CONTACTS, CONTACT_EMAIL } from "../data/site-data";

export default function ContactSection(): JSX.Element {
  return (
    <section id="contact" className="contact-section">
      <div className="contact-container">
        <div className="contact-header">
          <h2>Get in Touch</h2>
          <p>Let&apos;s discuss how we can help transform your business</p>
        </div>

        <ContactSectionList contacts={CONTACTS} />

        <div className="contact-button">
          <GlassButton
            className="contact-glass-button"
            variant="secondary"
            onClick={() => (window.location.href = `mailto:${CONTACT_EMAIL}`)}
          >
            Contact Us Now
          </GlassButton>
        </div>
      </div>
    </section>
  );
}
