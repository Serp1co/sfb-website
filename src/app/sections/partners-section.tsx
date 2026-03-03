"use client";

import { JSX } from "react";
import Image from "next/image";
import GlassPanel from "../components/glassism/glass-panel";
import { PARTNERS, CUSTOMERS, PartnerItem } from "../data/site-data";

interface PartnerGridProps {
  title: string;
  subtitle: string;
  items: PartnerItem[];
  glassColor: string;
  background: string;
}

function PartnerGrid({ title, subtitle, items, glassColor, background }: PartnerGridProps): JSX.Element {
  return (
    <>
      <div className="partners-container">
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>

      <GlassPanel
        width="100%"
        height={200}
        blur={40}
        glassColor={glassColor}
        style={{ background }}
      >
        <div className="partners-list">
          {items.map((partner, index) => (
            <div key={index} className="partners-listed">
              <Image
                src={partner.icon}
                alt={partner.name}
                width={150}
                height={150}
                className="partners-images"
              />
              <p style={{ width: "100%" }}>{partner.name}</p>
            </div>
          ))}
        </div>
      </GlassPanel>
    </>
  );
}

export default function PartnersSection(): JSX.Element {
  return (
    <section id="partners">
      <div style={{ width: "120%", margin: "-10%" }}>
        <PartnerGrid
          title="Our Partners"
          subtitle="Trusted by industry leaders"
          items={PARTNERS}
          glassColor="rgba(255, 174, 0, 0.1)"
          background="rgba(255, 174, 0, 0.06)"
        />

        <PartnerGrid
          title="Our Customers"
          subtitle="Trusted by industry leaders"
          items={CUSTOMERS}
          glassColor="rgba(204, 204, 204, 0.1)"
          background="rgba(204, 204, 204, 0.06)"
        />
      </div>
    </section>
  );
}
