"use client";

import { JSX } from "react";
import ServiceSectionList from "../components/services-section/services-section-list";
import { SERVICES } from "../data/site-data";

export default function ServicesSection(): JSX.Element {
  return (
    <section id="services">
      <div className="services-container">
        <div className="services-description">
          <h2>Our Services</h2>
          <p>Comprehensive IT solutions tailored to your needs</p>
        </div>

        <ServiceSectionList services={SERVICES} />
      </div>
    </section>
  );
}
